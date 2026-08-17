import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { StreamSessionStatus } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class StreamingService {
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
  }) {
    const token = body.token || body.password || body.user;
    if (!token) {
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

      const requestedPath = body.path?.replace(/^\//, '');
      if (requestedPath && payload.path !== requestedPath) {
        return { ok: false };
      }

      if (body.action === 'publish' && payload.action !== 'publish') {
        return { ok: false };
      }
      if (body.action === 'read' && payload.action !== 'read') {
        return { ok: false };
      }

      return { ok: true };
    } catch {
      return { ok: false };
    }
  }
}
