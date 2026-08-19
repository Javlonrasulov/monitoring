import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { StreamSessionStatus } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class StreamingService {
  private readonly logger = new Logger(StreamingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private streamPath(deviceId: string) {
    return `device/${deviceId}`;
  }

  async issuePublisherToken(deviceId: string, organizationId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId },
    });
    if (!device || device.disabled) {
      throw new ForbiddenException('Device not allowed to publish');
    }

    const ttl = Number(this.config.get('STREAM_TOKEN_TTL_SECONDS') ?? 120);
    const path = this.streamPath(device.id);
    const token = await this.jwt.signAsync(
      {
        sub: device.id,
        organizationId: device.organizationId,
        path,
        action: 'publish',
        typ: 'stream',
      },
      {
        secret: this.config.getOrThrow<string>('STREAM_TOKEN_SECRET'),
        expiresIn: ttl,
      },
    );

    const session = await this.prisma.streamSession.create({
      data: {
        deviceId: device.id,
        organizationId: device.organizationId,
        status: StreamSessionStatus.STARTING,
      },
    });

    const base =
      this.config.get<string>('MEDIAMTX_WHIP_BASE') ?? 'http://localhost:8889';

    return {
      token,
      expiresIn: ttl,
      path,
      whipUrl: `${base}/${path}/whip`,
      sessionId: session.id,
    };
  }

  async issueViewerToken(
    organizationId: string,
    userId: string,
    deviceId: string,
  ) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId },
    });
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    if (device.disabled) {
      throw new ForbiddenException('Device disabled');
    }

    const ttl = Number(this.config.get('STREAM_TOKEN_TTL_SECONDS') ?? 120);
    const path = this.streamPath(device.id);
    const token = await this.jwt.signAsync(
      {
        sub: userId,
        organizationId,
        deviceId: device.id,
        path,
        action: 'read',
        typ: 'stream',
      },
      {
        secret: this.config.getOrThrow<string>('STREAM_TOKEN_SECRET'),
        expiresIn: ttl,
      },
    );

    await this.audit.log({
      organizationId,
      userId,
      action: 'stream.view',
      resourceType: 'Device',
      resourceId: device.id,
    });

    const base =
      this.config.get<string>('MEDIAMTX_WHEP_BASE') ?? 'http://localhost:8889';

    return {
      token,
      expiresIn: ttl,
      path,
      whepUrl: `${base}/${path}/whep`,
      device: {
        id: device.id,
        name: device.name,
        status: device.status,
      },
    };
  }

  async issueRecorderToken(deviceId: string, organizationId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId },
    });
    if (!device || device.disabled) {
      throw new ForbiddenException('Device not allowed');
    }

    const ttl = Number(this.config.get('RECORDER_TOKEN_TTL_SECONDS') ?? 720);
    const path = this.streamPath(device.id);
    const token = await this.jwt.signAsync(
      {
        sub: `recorder:${device.id}`,
        organizationId: device.organizationId,
        deviceId: device.id,
        path,
        action: 'read',
        typ: 'stream',
      },
      {
        secret: this.config.getOrThrow<string>('STREAM_TOKEN_SECRET'),
        expiresIn: ttl,
      },
    );

    return { token, expiresIn: ttl, path };
  }

  async endSession(sessionId: string, organizationId: string, failed = false) {
    const session = await this.prisma.streamSession.findFirst({
      where: { id: sessionId, organizationId },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return this.prisma.streamSession.update({
      where: { id: sessionId },
      data: {
        status: failed ? StreamSessionStatus.FAILED : StreamSessionStatus.ENDED,
        endedAt: new Date(),
      },
    });
  }

  async markSessionActive(sessionId: string, deviceId: string) {
    return this.prisma.streamSession.updateMany({
      where: { id: sessionId, deviceId },
      data: { status: StreamSessionStatus.ACTIVE },
    });
  }

  async validateMediaMtxAuth(body: {
    user?: string;
    password?: string;
    token?: string;
    action?: string;
    path?: string;
    protocol?: string;
    ip?: string;
  }) {
    const action = (body.action ?? '').toLowerCase();
    const protocol = (body.protocol ?? '').toLowerCase();
    const path = (body.path ?? '').replace(/^\//, '');

    // RTSP is only reachable on the Docker network (port 8554 is not
    // published). JWT passwords are too long for RTSP and MediaMTX
    // returns 401, so the recorder is allowed by source IP instead.
    if (
      protocol === 'rtsp' &&
      (action === 'read' || action === 'playback' || action === '') &&
      this.isPrivateLanIp(body.ip)
    ) {
      return { ok: true };
    }

    const token = body.token || body.password || body.user;
    if (!token) {
      this.logger.warn(
        `MediaMTX auth denied (no token) action=${action} protocol=${protocol} ip=${body.ip} path=${path}`,
      );
      return { ok: false };
    }

    try {
      const payload = await this.jwt.verifyAsync<{
        typ: string;
        action: string;
        path: string;
        organizationId: string;
        deviceId?: string;
        sub: string;
      }>(token, {
        secret: this.config.getOrThrow<string>('STREAM_TOKEN_SECRET'),
      });

      if (payload.typ !== 'stream') {
        return { ok: false };
      }

      if (path && payload.path !== path) {
        return { ok: false };
      }

      if (action === 'publish' && payload.action !== 'publish') {
        return { ok: false };
      }
      if (action === 'read' && payload.action !== 'read') {
        return { ok: false };
      }

      return { ok: true };
    } catch {
      this.logger.warn(
        `MediaMTX auth denied (bad token) action=${action} protocol=${protocol} ip=${body.ip} path=${path}`,
      );
      return { ok: false };
    }
  }

  async listSessions(organizationId: string) {
    return this.prisma.streamSession.findMany({
      where: { organizationId },
      include: { device: { select: { id: true, name: true, status: true } } },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
  }

  private isPrivateLanIp(ip?: string) {
    if (!ip) {
      return false;
    }
    const value = ip.replace(/^::ffff:/, '');
    if (value === '127.0.0.1' || value === '::1') {
      return true;
    }
    if (value.startsWith('10.') || value.startsWith('192.168.')) {
      return true;
    }
    const match = /^172\.(\d+)\./.exec(value);
    if (match) {
      const second = Number(match[1]);
      return second >= 16 && second <= 31;
    }
    return false;
  }
}
