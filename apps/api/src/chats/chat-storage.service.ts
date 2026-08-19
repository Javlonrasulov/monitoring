import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, createWriteStream, existsSync } from 'fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
import { dirname, extname, join, normalize, sep } from 'path';
import { pipeline } from 'stream/promises';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { ChatMessageType } from '../generated/prisma';

const CHUNK_SIZE = 256 * 1024;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

const BLOCKED_EXT = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.pif',
  '.js',
  '.mjs',
  '.vbs',
  '.msi',
  '.dll',
  '.ps1',
]);

export type ChatUploadMeta = {
  uploadId: string;
  organizationId: string;
  threadId: string;
  senderUserId: string;
  receiverUserId: string;
  messageType: ChatMessageType;
  fileName: string;
  mimeType: string;
  fileSize: number;
  chunkSize: number;
  durationMs?: number;
  width?: number;
  height?: number;
  replyToId?: string;
  clientId?: string;
  albumId?: string;
  waveformJson?: string;
  text?: string;
  received: number[];
  createdAt: string;
  completing?: boolean;
};

@Injectable()
export class ChatStorageService {
  constructor(private readonly config: ConfigService) {}

  rootDir() {
    return this.config.get<string>('CHAT_UPLOAD_DIR') ?? './uploads/chat';
  }

  filesDir() {
    return join(this.rootDir(), 'files');
  }

  tmpDir() {
    return join(this.rootDir(), 'tmp');
  }

  assertSafeName(fileName: string) {
    const base = fileName.replace(/[/\\]/g, '').trim();
    if (!base) throw new BadRequestException('Filename required');
    const ext = extname(base).toLowerCase();
    if (BLOCKED_EXT.has(ext)) {
      throw new BadRequestException('This file type is not allowed');
    }
    return base.slice(0, 240);
  }

  assertMessageType(type: ChatMessageType) {
    if (type === ChatMessageType.TEXT) {
      throw new BadRequestException('Media upload required');
    }
  }

  async createSession(meta: Omit<ChatUploadMeta, 'uploadId' | 'received' | 'createdAt' | 'chunkSize'> & {
    chunkSize?: number;
  }): Promise<ChatUploadMeta> {
    if (meta.fileSize > MAX_FILE_BYTES) {
      throw new BadRequestException('File is too large');
    }
    this.assertSafeName(meta.fileName);
    this.assertMessageType(meta.messageType);
    const uploadId = randomUUID();
    const session: ChatUploadMeta = {
      ...meta,
      uploadId,
      chunkSize: meta.chunkSize ?? CHUNK_SIZE,
      received: [],
      createdAt: new Date().toISOString(),
    };
    const dir = join(this.tmpDir(), uploadId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'meta.json'), JSON.stringify(session), 'utf8');
    return session;
  }

  async loadSession(uploadId: string): Promise<ChatUploadMeta> {
    const file = join(this.tmpDir(), this.safeId(uploadId), 'meta.json');
    if (!existsSync(file)) {
      throw new NotFoundException('Upload session expired');
    }
    const raw = await readFile(file, 'utf8');
    const session = JSON.parse(raw) as ChatUploadMeta;
    if (Date.now() - Date.parse(session.createdAt) > SESSION_TTL_MS) {
      await this.removeSession(uploadId);
      throw new NotFoundException('Upload session expired');
    }
    return session;
  }

  async saveSession(session: ChatUploadMeta) {
    const file = join(this.tmpDir(), this.safeId(session.uploadId), 'meta.json');
    await writeFile(file, JSON.stringify(session), 'utf8');
  }

  async writeChunk(uploadId: string, index: number, req: Request) {
    if (!Number.isInteger(index) || index < 0 || index > 4000) {
      throw new BadRequestException('Invalid chunk index');
    }
    const session = await this.loadSession(uploadId);
    if (session.completing) {
      throw new BadRequestException('Upload is already finishing');
    }
    const dest = join(
      this.tmpDir(),
      this.safeId(uploadId),
      `chunk-${String(index).padStart(6, '0')}`,
    );
    await pipeline(req, createWriteStream(dest));
    const size = (await stat(dest)).size;
    if (size > session.chunkSize * 2) {
      await rm(dest, { force: true });
      throw new BadRequestException('Chunk too large');
    }
    if (!session.received.includes(index)) {
      session.received.push(index);
      session.received.sort((a, b) => a - b);
      await this.saveSession(session);
    }
    const receivedBytes = await this.receivedBytes(uploadId);
    return {
      ok: true,
      index,
      receivedChunks: session.received.length,
      receivedBytes,
      fileSize: session.fileSize,
    };
  }

  async receivedBytes(uploadId: string) {
    const dir = join(this.tmpDir(), this.safeId(uploadId));
    const names = await readdir(dir);
    let total = 0;
    for (const name of names) {
      if (!name.startsWith('chunk-')) continue;
      total += (await stat(join(dir, name))).size;
    }
    return total;
  }

  async markCompleting(uploadId: string) {
    const session = await this.loadSession(uploadId);
    if (session.completing) {
      throw new BadRequestException('Upload is already finishing');
    }
    session.completing = true;
    await this.saveSession(session);
    return session;
  }

  async assemble(uploadId: string, storageKey: string) {
    const session = await this.loadSession(uploadId);
    const expected = Math.ceil(session.fileSize / session.chunkSize);
    if (session.received.length < expected) {
      throw new BadRequestException('Upload is incomplete');
    }
    const receivedBytes = await this.receivedBytes(uploadId);
    if (receivedBytes !== session.fileSize) {
      throw new BadRequestException('Upload size mismatch');
    }
    const dest = this.absoluteKey(storageKey);
    await mkdir(dirname(dest), { recursive: true });
    const out = createWriteStream(dest);
    try {
      for (let i = 0; i < expected; i++) {
        const chunk = join(
          this.tmpDir(),
          this.safeId(uploadId),
          `chunk-${String(i).padStart(6, '0')}`,
        );
        if (!existsSync(chunk)) {
          throw new BadRequestException(`Missing chunk ${i}`);
        }
        await new Promise<void>((resolve, reject) => {
          const input = createReadStream(chunk);
          input.on('error', reject);
          input.on('end', resolve);
          input.pipe(out, { end: false });
        });
      }
    } catch (error) {
      out.destroy();
      await rm(dest, { force: true });
      throw error;
    }
    await new Promise<void>((resolve, reject) => {
      out.end((err: Error | null | undefined) => (err ? reject(err) : resolve()));
    });
    const size = (await stat(dest)).size;
    if (size > MAX_FILE_BYTES) {
      await rm(dest, { force: true });
      throw new BadRequestException('File is too large');
    }
    return size;
  }

  async writeThumbnail(storageKey: string, req: Request) {
    const dest = this.absoluteKey(storageKey);
    await mkdir(dirname(dest), { recursive: true });
    await pipeline(req, createWriteStream(dest));
    const size = (await stat(dest)).size;
    if (size > 4 * 1024 * 1024) {
      await rm(dest, { force: true });
      throw new BadRequestException('Thumbnail too large');
    }
    return size;
  }

  async removeSession(uploadId: string) {
    await rm(join(this.tmpDir(), this.safeId(uploadId)), {
      recursive: true,
      force: true,
    });
  }

  storageKey(organizationId: string, threadId: string, messageId: string, fileName: string) {
    const ext = extname(this.assertSafeName(fileName)).slice(0, 12) || '.bin';
    return `${organizationId}/${threadId}/${messageId}/file${ext}`;
  }

  thumbnailKey(organizationId: string, threadId: string, messageId: string) {
    return `${organizationId}/${threadId}/${messageId}/thumb.jpg`;
  }

  absoluteKey(storageKey: string) {
    const root = this.filesDir();
    const full = normalize(join(root, storageKey));
    const rootNorm = normalize(root) + sep;
    if (full !== normalize(root) && !full.startsWith(rootNorm)) {
      throw new BadRequestException('Invalid storage key');
    }
    return full;
  }

  async streamFile(
    req: Request,
    res: Response,
    storageKey: string,
    mimeType: string,
    fileName: string,
    download: boolean,
  ) {
    const full = this.absoluteKey(storageKey);
    if (!existsSync(full)) throw new NotFoundException('File missing');
    const size = (await stat(full)).size;
    const safeName = this.assertSafeName(fileName);
    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const disposition = download ? 'attachment' : 'inline';
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(safeName)}"`,
    );

    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      const start = match ? Number(match[1]) : 0;
      const end = match?.[2] ? Number(match[2]) : size - 1;
      if (start >= size || end >= size || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', end - start + 1);
      createReadStream(full, { start, end }).pipe(res);
      return;
    }

    res.setHeader('Content-Length', size);
    createReadStream(full).pipe(res);
  }

  private safeId(id: string) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new BadRequestException('Invalid upload id');
    }
    return id;
  }
}
