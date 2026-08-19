import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync } from 'fs';
import { mkdir, rm, stat, writeFile } from 'fs/promises';
import { dirname, join, normalize, sep } from 'path';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

@Injectable()
export class AvatarsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: EventsGateway,
  ) {}

  rootDir() {
    return this.config.get<string>('AVATAR_DIR') ?? './uploads/avatars';
  }

  async saveForDevice(
    organizationId: string,
    deviceId: string,
    imageBase64: string,
  ) {
    const user = await this.deviceUser(organizationId, deviceId);
    const bytes = this.decodeImage(imageBase64);
    const key = this.storageKey(organizationId, user.id);
    const dest = this.absoluteKey(key);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, bytes);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { avatarKey: key, avatarUpdatedAt: new Date() },
      select: { id: true, name: true, avatarKey: true, avatarUpdatedAt: true },
    });
    this.events.emitToOrg(organizationId, 'chat.profile', {
      userId: updated.id,
      avatarUpdatedAt: updated.avatarUpdatedAt,
    });
    return this.present(updated);
  }

  async deleteForDevice(organizationId: string, deviceId: string) {
    const user = await this.deviceUser(organizationId, deviceId);
    if (user.avatarKey) {
      await rm(this.absoluteKey(user.avatarKey), { force: true });
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { avatarKey: null, avatarUpdatedAt: new Date() },
      select: { id: true, name: true, avatarKey: true, avatarUpdatedAt: true },
    });
    this.events.emitToOrg(organizationId, 'chat.profile', {
      userId: updated.id,
      avatarUpdatedAt: updated.avatarUpdatedAt,
    });
    return this.present(updated);
  }

  async streamForOrg(
    req: Request,
    res: Response,
    organizationId: string,
    userId: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { avatarKey: true },
    });
    if (!user?.avatarKey) throw new NotFoundException('Photo not found');
    const full = this.absoluteKey(user.avatarKey);
    if (!existsSync(full)) throw new NotFoundException('Photo not found');
    const size = (await stat(full)).size;
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', size);
    createReadStream(full).pipe(res);
  }

  present(user: {
    id: string;
    name: string;
    avatarKey: string | null;
    avatarUpdatedAt: Date | null;
  }) {
    return {
      userId: user.id,
      name: user.name,
      hasAvatar: Boolean(user.avatarKey),
      avatarUpdatedAt: user.avatarUpdatedAt,
    };
  }

  private decodeImage(imageBase64: string) {
    const raw = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '').trim();
    if (!raw) throw new BadRequestException('Photo is required');
    let bytes: Buffer;
    try {
      bytes = Buffer.from(raw, 'base64');
    } catch {
      throw new BadRequestException('Photo is invalid');
    }
    if (bytes.length < 24 || bytes.length > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Photo is too large');
    }
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const png =
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47;
    if (!jpeg && !png) {
      throw new BadRequestException('Send a JPEG or PNG photo');
    }
    return bytes;
  }

  private async deviceUser(organizationId: string, deviceId: string) {
    const user = await this.prisma.user.findFirst({
      where: { deviceId, organizationId },
    });
    if (!user) throw new ForbiddenException('No user account for this device');
    return user;
  }

  private storageKey(organizationId: string, userId: string) {
    return `${organizationId}/${userId}.jpg`;
  }

  private absoluteKey(storageKey: string) {
    const root = normalize(this.rootDir());
    const full = normalize(join(root, storageKey));
    const rootNorm = root + sep;
    if (full !== root && !full.startsWith(rootNorm)) {
      throw new BadRequestException('Invalid storage key');
    }
    return full;
  }
}
