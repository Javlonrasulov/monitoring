import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SnapshotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async createFromBase64(
    organizationId: string,
    userId: string,
    deviceId: string,
    imageBase64: string,
  ) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId },
    });
    if (!device) {
      throw new NotFoundException('Device not found');
    }

    const match = imageBase64.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
    const raw = match ? match[2] : imageBase64;
    if (!raw) {
      throw new BadRequestException('Invalid image payload');
    }

    const ext = match?.[1] === 'png' ? 'png' : 'jpg';
    const dir =
      this.config.get<string>('SNAPSHOT_DIR') ?? './uploads/snapshots';
    await mkdir(dir, { recursive: true });

    const filename = `${device.id}-${Date.now()}-${randomUUID()}.${ext}`;
    const fullPath = join(dir, filename);
    await writeFile(fullPath, Buffer.from(raw, 'base64'));

    const snapshot = await this.prisma.snapshot.create({
      data: {
        deviceId: device.id,
        organizationId: device.organizationId,
        branchId: device.branchId,
        userId,
        path: filename,
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'snapshot.created',
      resourceType: 'Snapshot',
      resourceId: snapshot.id,
      metadata: { deviceId: device.id },
    });

    return {
      ...snapshot,
      url: `/snapshots/${filename}`,
    };
  }

  list(organizationId: string, deviceId?: string) {
    return this.prisma.snapshot.findMany({
      where: {
        organizationId,
        ...(deviceId ? { deviceId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
