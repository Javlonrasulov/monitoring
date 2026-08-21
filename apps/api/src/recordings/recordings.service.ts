import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createReadStream, existsSync } from 'fs';
import { statfs, mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';
import { join } from 'path';
import type { ChildProcess } from 'child_process';
import type { Request, Response } from 'express';
import {
  CameraFacing,
  Prisma,
  RecordingStatus,
} from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { AuditService } from '../audit/audit.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { seesAllOrganizations } from '../auth/platform-org';
import {
  ensureParentDir,
  fileSizeOrZero,
  recordingsRootJoin,
  removeIfExists,
  spawnSegmentRecorder,
  type RecorderQuality,
} from './recorder.engine';
import { streamStoreZip } from './zip-stream';

type ActiveJob = {
  deviceId: string;
  organizationId: string;
  quality: RecorderQuality;
  camera: CameraFacing;
  running: boolean;
  proc: ChildProcess | null;
  segmentId: string | null;
};

const MIN_SEGMENT_BYTES = 20_000;

@Injectable()
export class RecordingsService implements OnModuleDestroy {
  private readonly logger = new Logger(RecordingsService.name);
  private readonly jobs = new Map<string, ActiveJob>();
  private maintenanceTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly audit: AuditService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly subscriptions: SubscriptionsService,
  ) {
    this.maintenanceTimer = setInterval(() => {
      void this.runMaintenance();
    }, 5 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
    }
    for (const job of this.jobs.values()) {
      job.running = false;
      job.proc?.kill('SIGTERM');
    }
  }

  private recordingsDir() {
    return this.config.get<string>('RECORDINGS_DIR') ?? './uploads/recordings';
  }

  private ffmpegPath() {
    return this.config.get<string>('FFMPEG_PATH') ?? 'ffmpeg';
  }

  private rtspBase() {
    return (
      this.config.get<string>('MEDIAMTX_RTSP_BASE') ?? 'rtsp://127.0.0.1:8554'
    ).replace(/\/$/, '');
  }

  isRecording(deviceId: string) {
    return this.jobs.get(deviceId)?.running === true;
  }

  async start(organizationId: string, deviceId: string, quality?: RecorderQuality) {
    const allowed = await this.subscriptions.assertCanWatch(
      organizationId,
      'recordings',
    );
    if (!allowed.ok) {
      throw new ForbiddenException('Pro+ is required for recordings');
    }
    const device = await this.prisma.device.findFirst({
      where: seesAllOrganizations(organizationId)
        ? { id: deviceId }
        : { id: deviceId, organizationId },
    });
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    if (device.disabled) {
      throw new ForbiddenException('Device disabled');
    }
    return this.beginJob(device.organizationId, device, quality);
  }

  /**
   * Pro+ device viewer: record the linked phone using the viewer's entitlement.
   */
  async startForLinkedViewer(
    viewerDeviceId: string,
    viewerOrganizationId: string,
    targetDeviceId: string,
    quality?: RecorderQuality,
  ) {
    const allowed = await this.subscriptions.assertCanWatch(
      viewerOrganizationId,
      'recordings',
    );
    if (!allowed.ok) {
      throw new ForbiddenException('Pro+ is required for recordings');
    }
    const target = await this.requireLinkedTarget(viewerDeviceId, targetDeviceId);
    await this.prisma.organization.update({
      where: { id: target.organizationId },
      data: { recordingRetentionDays: 3 },
    });
    return this.beginJob(target.organizationId, target, quality);
  }

  async listForLinkedViewer(
    viewerDeviceId: string,
    viewerOrganizationId: string,
    targetDeviceId: string,
  ) {
    const allowed = await this.subscriptions.assertCanWatch(
      viewerOrganizationId,
      'recordings',
    );
    if (!allowed.ok) {
      throw new ForbiddenException('Pro+ is required for recordings');
    }
    const target = await this.requireLinkedTarget(viewerDeviceId, targetDeviceId);
    const from = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    return this.list(target.organizationId, {
      deviceId: target.id,
      from,
      page: 1,
      pageSize: 100,
    });
  }

  async playbackTokenForLinkedViewer(
    viewerDeviceId: string,
    viewerOrganizationId: string,
    viewerUserId: string | undefined,
    recordingId: string,
  ) {
    const allowed = await this.subscriptions.assertCanWatch(
      viewerOrganizationId,
      'recordings',
    );
    if (!allowed.ok) {
      throw new ForbiddenException('Pro+ is required for recordings');
    }
    const row = await this.prisma.recordingSegment.findFirst({
      where: { id: recordingId, status: { not: RecordingStatus.DELETED } },
      include: { device: true },
    });
    if (!row?.device) {
      throw new NotFoundException('Recording not found');
    }
    await this.requireLinkedTarget(viewerDeviceId, row.deviceId);
    if (row.status !== RecordingStatus.READY) {
      throw new BadRequestException('Recording is not ready');
    }
    const ageMs = Date.now() - row.startedAt.getTime();
    if (ageMs > 3 * 24 * 60 * 60 * 1000) {
      throw new ForbiddenException('Recordings older than 3 days are not available');
    }
    return this.playbackToken(
      row.organizationId,
      viewerUserId ?? viewerDeviceId,
      row.id,
      false,
    );
  }

  private async requireLinkedTarget(viewerDeviceId: string, targetDeviceId: string) {
    if (viewerDeviceId === targetDeviceId) {
      throw new BadRequestException('Cannot target own device');
    }
    const [viewer, target] = await Promise.all([
      this.prisma.device.findFirst({ where: { id: viewerDeviceId } }),
      this.prisma.device.findFirst({ where: { id: targetDeviceId } }),
    ]);
    if (!viewer || !target || target.disabled) {
      throw new ForbiddenException('Device is not linked to this account');
    }
    const linked =
      target.linkedFromDeviceId === viewerDeviceId ||
      viewer.linkedFromDeviceId === targetDeviceId;
    if (!linked) {
      throw new ForbiddenException('Device is not linked to this account');
    }
    return target;
  }

  private beginJob(
    organizationId: string,
    device: { id: string; name: string; capabilitiesJson: Prisma.JsonValue | null },
    quality?: RecorderQuality,
  ) {
    const existing = this.jobs.get(device.id);
    if (existing?.running) {
      return { ok: true, alreadyRunning: true, deviceId: device.id };
    }

    const camera = this.cameraOf(device.capabilitiesJson);
    const job: ActiveJob = {
      deviceId: device.id,
      organizationId,
      quality: quality ?? 'MEDIUM',
      camera,
      running: true,
      proc: null,
      segmentId: null,
    };
    this.jobs.set(device.id, job);
    void this.loop(job, device.name);
    this.emit(organizationId, {
      deviceId: device.id,
      status: RecordingStatus.RECORDING,
    });
    return {
      ok: true,
      alreadyRunning: false,
      deviceId: device.id,
      camera,
    };
  }

  async stop(organizationId: string, deviceId: string) {
    const job = this.jobs.get(deviceId);
    if (!job || job.organizationId !== organizationId) {
      return { ok: true, stopped: false };
    }
    job.running = false;
    job.proc?.kill('SIGTERM');
    setTimeout(() => job.proc?.kill('SIGKILL'), 2500);
    this.emit(organizationId, {
      deviceId,
      status: 'STOPPED',
    });
    return { ok: true, stopped: true };
  }

  async rotateCamera(deviceId: string, facing: 'FRONT' | 'BACK') {
    const job = this.jobs.get(deviceId);
    if (!job?.running) {
      return;
    }
    const next = facing === 'FRONT' ? CameraFacing.FRONT : CameraFacing.BACK;
    if (job.camera === next) {
      return;
    }
    job.camera = next;
    job.proc?.kill('SIGTERM');
  }

  async list(
    organizationId: string,
    query: {
      deviceId?: string;
      camera?: 'FRONT' | 'BACK';
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where = this.where(organizationId, query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.recordingSegment.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.recordingSegment.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async timeline(
    organizationId: string,
    query: {
      deviceId?: string;
      camera?: 'FRONT' | 'BACK';
      from?: string;
      to?: string;
    },
  ) {
    const where = this.where(organizationId, query);
    const items = await this.prisma.recordingSegment.findMany({
      where,
      orderBy: { startedAt: 'asc' },
      take: 2000,
    });
    return { items };
  }

  async settings(organizationId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    return {
      retentionDays: org.recordingRetentionDays,
      autoCleanup: org.recordingAutoCleanup,
      segmentSeconds: org.recordingSegmentSeconds,
    };
  }

  async updateSettings(
    organizationId: string,
    userId: string,
    dto: {
      retentionDays?: number;
      autoCleanup?: boolean;
      segmentSeconds?: number;
    },
  ) {
    const org = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        recordingRetentionDays: dto.retentionDays,
        recordingAutoCleanup: dto.autoCleanup,
        recordingSegmentSeconds: dto.segmentSeconds,
      },
    });
    await this.audit.log({
      organizationId,
      userId,
      action: 'recording.settings',
      resourceType: 'Organization',
      resourceId: organizationId,
      metadata: dto,
    });
    return {
      retentionDays: org.recordingRetentionDays,
      autoCleanup: org.recordingAutoCleanup,
      segmentSeconds: org.recordingSegmentSeconds,
    };
  }

  async storage(organizationId: string) {
    const dir = this.recordingsDir();
    await mkdir(dir, { recursive: true });
    const fsStats = await statfs(dir);
    const total = Number(fsStats.blocks) * Number(fsStats.bsize);
    const free = Number(fsStats.bavail) * Number(fsStats.bsize);
    const used = Math.max(0, total - free);
    const recordingSize = await this.prisma.recordingSegment.aggregate({
      where: {
        organizationId,
        status: { in: [RecordingStatus.READY, RecordingStatus.RECORDING] },
      },
      _sum: { fileSize: true },
    });
    const ratio = total > 0 ? used / total : 0;
    const level =
      ratio >= 0.95 ? 'cleanup' : ratio >= 0.9 ? 'critical' : ratio >= 0.8 ? 'warning' : 'ok';
    return {
      totalBytes: total,
      usedBytes: used,
      freeBytes: free,
      recordingBytes: recordingSize._sum.fileSize ?? 0,
      usedRatio: ratio,
      level,
    };
  }

  async deleteOne(organizationId: string, userId: string, id: string) {
    const row = await this.prisma.recordingSegment.findFirst({
      where: seesAllOrganizations(organizationId)
        ? { id }
        : { id, organizationId },
    });
    if (!row) {
      throw new NotFoundException('Recording not found');
    }
    await this.purgeRow(row);
    await this.audit.log({
      organizationId,
      userId,
      action: 'recording.deleted',
      resourceType: 'RecordingSegment',
      resourceId: id,
    });
    return { ok: true };
  }

  async deleteMany(organizationId: string, userId: string, ids: string[]) {
    const rows = await this.prisma.recordingSegment.findMany({
      where: { organizationId, id: { in: ids } },
    });
    for (const row of rows) {
      await this.purgeRow(row);
    }
    await this.audit.log({
      organizationId,
      userId,
      action: 'recording.deleted_bulk',
      resourceType: 'RecordingSegment',
      metadata: { count: rows.length },
    });
    return { ok: true, deleted: rows.length };
  }

  async deleteRange(
    organizationId: string,
    userId: string,
    query: {
      deviceId?: string;
      camera?: 'FRONT' | 'BACK';
      from?: string;
      to?: string;
      all?: boolean;
    },
  ) {
    if (query.all && !query.from && !query.to && !query.deviceId) {
      const rows = await this.prisma.recordingSegment.findMany({
        where: { organizationId, status: { not: RecordingStatus.RECORDING } },
      });
      for (const row of rows) {
        await this.purgeRow(row);
      }
      await this.audit.log({
        organizationId,
        userId,
        action: 'recording.deleted_all',
        resourceType: 'RecordingSegment',
        metadata: { count: rows.length },
      });
      return { ok: true, deleted: rows.length };
    }
    const where = this.where(organizationId, query);
    where.status = { not: RecordingStatus.RECORDING };
    const rows = await this.prisma.recordingSegment.findMany({ where });
    for (const row of rows) {
      await this.purgeRow(row);
    }
    await this.audit.log({
      organizationId,
      userId,
      action: 'recording.deleted_range',
      resourceType: 'RecordingSegment',
      metadata: { count: rows.length, ...query },
    });
    return { ok: true, deleted: rows.length };
  }

  async playbackToken(
    organizationId: string,
    userId: string,
    id: string,
    download = false,
  ) {
    const row = await this.requireReady(organizationId, id);
    const token = await this.jwt.signAsync(
      {
        sub: userId,
        organizationId,
        recordingId: row.id,
        typ: 'recording',
        download,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: '15m',
      },
    );
    const suffix = download ? '&download=1' : '';
    return {
      token,
      url: `/recordings/${row.id}/media?token=${encodeURIComponent(token)}${suffix}`,
    };
  }

  async exportToken(
    organizationId: string,
    userId: string,
    query: {
      deviceId?: string;
      camera?: 'FRONT' | 'BACK';
      from?: string;
      to?: string;
    },
  ) {
    const token = await this.jwt.signAsync(
      {
        sub: userId,
        organizationId,
        typ: 'recording-export',
        deviceId: query.deviceId ?? null,
        camera: query.camera ?? null,
        from: query.from ?? null,
        to: query.to ?? null,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: '15m',
      },
    );
    const params = new URLSearchParams({ token });
    if (query.deviceId) params.set('deviceId', query.deviceId);
    if (query.camera) params.set('camera', query.camera);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    return { token, url: `/recordings/export/file?${params.toString()}` };
  }

  async streamMedia(
    req: Request,
    res: Response,
    organizationId: string,
    id: string,
    download = false,
  ) {
    const row = await this.requireReady(organizationId, id);
    const full = recordingsRootJoin(this.recordingsDir(), row.storagePath);
    const size = await fileSizeOrZero(full);
    if (size <= 0) {
      throw new NotFoundException('Recording file missing');
    }

    const filename = `${row.deviceName}-${row.cameraFacing}-${row.startedAt.toISOString().replace(/[:.]/g, '-')}.webm`;
    res.setHeader('Content-Type', 'video/webm');
    res.setHeader('Accept-Ranges', 'bytes');
    if (download) {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    }

    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      const start = match ? Number(match[1]) : 0;
      const end = match?.[2] ? Number(match[2]) : size - 1;
      if (start >= size || end >= size) {
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

  async streamExport(
    res: Response,
    organizationId: string,
    query: {
      deviceId?: string;
      camera?: 'FRONT' | 'BACK';
      from?: string;
      to?: string;
    },
  ) {
    const where = this.where(organizationId, query);
    where.status = RecordingStatus.READY;
    const rows = await this.prisma.recordingSegment.findMany({
      where,
      orderBy: { startedAt: 'asc' },
      take: 500,
    });
    const files = rows
      .map((row) => ({
        diskPath: recordingsRootJoin(this.recordingsDir(), row.storagePath),
        name: `${row.startedAt.toISOString().replace(/[:.]/g, '-')}_${row.cameraFacing}.webm`,
        row,
      }))
      .filter((file) => existsSync(file.diskPath));
    if (files.length === 0) {
      throw new NotFoundException('No recordings in range');
    }

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="archive-${stamp}.zip"`,
    );
    await streamStoreZip(files, res);
    res.end();
  }

  async verifyPlaybackToken(token: string) {
    const payload = await this.jwt.verifyAsync<{
      typ: string;
      organizationId: string;
      recordingId?: string;
      download?: boolean;
      deviceId?: string | null;
      camera?: 'FRONT' | 'BACK' | null;
      from?: string | null;
      to?: string | null;
    }>(token, {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
    });
    if (payload.typ !== 'recording' && payload.typ !== 'recording-export') {
      throw new ForbiddenException('Invalid playback token');
    }
    return payload;
  }

  private async loop(job: ActiveJob, deviceName: string) {
    while (job.running) {
      try {
        await this.recordOne(job, deviceName);
      } catch (error) {
        this.logger.warn(
          `Recorder ${job.deviceId} failed: ${error instanceof Error ? error.message : error}`,
        );
        await this.sleep(3000);
      }
    }
    this.jobs.delete(job.deviceId);
  }

  private async recordOne(job: ActiveJob, deviceName: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: job.organizationId },
    });
    const durationSec = org?.recordingSegmentSeconds ?? 300;
    const storage = await this.storage(job.organizationId);
    if (storage.level === 'cleanup' && org?.recordingAutoCleanup) {
      await this.cleanupOldest(job.organizationId, 0.85);
    } else if (storage.usedRatio >= 0.98) {
      throw new Error('Disk full — recording paused');
    }

    const path = `device/${job.deviceId}`;
    const rtspUrl = `${this.rtspBase()}/${path}`;

    const id = randomUUID();
    const storagePath = join(
      job.organizationId,
      job.deviceId,
      `${id}.webm`,
    ).replace(/\\/g, '/');
    const fullPath = recordingsRootJoin(this.recordingsDir(), storagePath);
    await ensureParentDir(fullPath);

    const row = await this.prisma.recordingSegment.create({
      data: {
        id,
        organizationId: job.organizationId,
        deviceId: job.deviceId,
        deviceName,
        cameraFacing: job.camera,
        quality: job.quality,
        status: RecordingStatus.RECORDING,
        storagePath,
        startedAt: new Date(),
      },
    });
    job.segmentId = row.id;
    this.emit(job.organizationId, {
      deviceId: job.deviceId,
      recordingId: row.id,
      status: RecordingStatus.RECORDING,
      cameraFacing: job.camera,
    });

    const stderr: string[] = [];
    const proc = spawnSegmentRecorder({
      ffmpegPath: this.ffmpegPath(),
      rtspUrl,
      outputPath: fullPath,
      quality: job.quality,
      durationSec,
    });
    job.proc = proc;
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr.push(text);
      if (stderr.length > 20) stderr.shift();
    });

    const code = await new Promise<number | null>((resolve) => {
      proc.on('close', (exitCode) => resolve(exitCode));
      proc.on('error', () => resolve(1));
    });
    job.proc = null;

    const endedAt = new Date();
    const size = await fileSizeOrZero(fullPath);
    const duration = Math.max(
      0,
      Math.round((endedAt.getTime() - row.startedAt.getTime()) / 1000),
    );

    if (size < MIN_SEGMENT_BYTES) {
      this.logger.warn(
        `Dropping short segment ${row.id} exit=${code} size=${size} ${stderr.join('').slice(-500)}`,
      );
      await removeIfExists(fullPath);
      await this.prisma.recordingSegment.delete({ where: { id: row.id } }).catch(() => undefined);
      if (job.running) {
        await this.sleep(4000);
      }
      return;
    }

    const ready = await this.prisma.recordingSegment.update({
      where: { id: row.id },
      data: {
        status: RecordingStatus.READY,
        endedAt,
        durationSec: duration,
        fileSize: size,
        errorMessage: null,
      },
    });
    this.emit(job.organizationId, {
      deviceId: job.deviceId,
      recordingId: ready.id,
      status: RecordingStatus.READY,
      cameraFacing: job.camera,
      durationSec: duration,
      fileSize: size,
    });
  }

  async runMaintenance() {
    const orgs = await this.prisma.organization.findMany({
      select: {
        id: true,
        recordingRetentionDays: true,
        recordingAutoCleanup: true,
      },
    });
    for (const org of orgs) {
      const cutoff = new Date(
        Date.now() - org.recordingRetentionDays * 24 * 60 * 60 * 1000,
      );
      const expired = await this.prisma.recordingSegment.findMany({
        where: {
          organizationId: org.id,
          status: { not: RecordingStatus.RECORDING },
          startedAt: { lt: cutoff },
        },
        take: 200,
      });
      for (const row of expired) {
        await this.purgeRow(row);
      }
      if (org.recordingAutoCleanup) {
        const storage = await this.storage(org.id);
        if (storage.level === 'cleanup' || storage.level === 'critical') {
          await this.cleanupOldest(org.id, 0.8);
        }
      }
    }
  }

  private async cleanupOldest(organizationId: string, targetRatio: number) {
    for (let i = 0; i < 50; i += 1) {
      const storage = await this.storage(organizationId);
      if (storage.usedRatio <= targetRatio) {
        return;
      }
      const oldest = await this.prisma.recordingSegment.findFirst({
        where: {
          organizationId,
          status: RecordingStatus.READY,
        },
        orderBy: { startedAt: 'asc' },
      });
      if (!oldest) {
        return;
      }
      await this.purgeRow(oldest);
    }
  }

  private async purgeRow(row: { id: string; storagePath: string }) {
    await removeIfExists(recordingsRootJoin(this.recordingsDir(), row.storagePath));
    await this.prisma.recordingSegment.delete({ where: { id: row.id } }).catch(() => undefined);
  }

  private async requireReady(organizationId: string, id: string) {
    const row = await this.prisma.recordingSegment.findFirst({
      where: seesAllOrganizations(organizationId)
        ? { id }
        : { id, organizationId },
    });
    if (!row) {
      throw new NotFoundException('Recording not found');
    }
    if (row.status !== RecordingStatus.READY) {
      throw new BadRequestException('Recording is not ready');
    }
    return row;
  }

  private where(
    organizationId: string,
    query: {
      deviceId?: string;
      camera?: 'FRONT' | 'BACK';
      from?: string;
      to?: string;
    },
  ): Prisma.RecordingSegmentWhereInput {
    const startedAt: Prisma.DateTimeFilter = {};
    if (query.from) startedAt.gte = new Date(query.from);
    if (query.to) startedAt.lte = new Date(query.to);
    return {
      ...(seesAllOrganizations(organizationId) ? {} : { organizationId }),
      status: { not: RecordingStatus.DELETED },
      ...(query.deviceId ? { deviceId: query.deviceId } : {}),
      ...(query.camera ? { cameraFacing: query.camera as CameraFacing } : {}),
      ...(query.from || query.to ? { startedAt } : {}),
    };
  }

  private cameraOf(json: Prisma.JsonValue | null): CameraFacing {
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      if ((json as Record<string, unknown>).cameraFacing === 'BACK') {
        return CameraFacing.BACK;
      }
    }
    return CameraFacing.FRONT;
  }

  private emit(organizationId: string, payload: Record<string, unknown>) {
    this.events.emitToOrg(organizationId, 'recording.status', payload);
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
