import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DeviceStatus, NetworkType, Prisma } from '../generated/prisma';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { AuditService } from '../audit/audit.service';
import { RecordingsService } from '../recordings/recordings.service';
import {
  CreatePairingCodeDto,
  DeviceStatusDto,
  PairDeviceDto,
} from './dto/devices.dto';

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly events: EventsGateway,
    private readonly audit: AuditService,
    private readonly recordings: RecordingsService,
  ) {}

  async listForOrg(organizationId: string) {
    const devices = await this.prisma.device.findMany({
      where: { organizationId },
      include: { branch: true },
      orderBy: { name: 'asc' },
    });
    return devices.map((device) => this.withCameraFacing(device));
  }

  async getForOrg(organizationId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId },
      include: { branch: true },
    });
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    return this.withCameraFacing(device);
  }

  async getMe(deviceId: string, organizationId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId },
    });
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    if (device.disabled) {
      throw new ForbiddenException('Device disabled');
    }
    return {
      id: device.id,
      status: device.status,
      cameraFacing: this.cameraFacingOf(device.capabilitiesJson),
    };
  }

  async setCameraFacing(
    organizationId: string,
    userId: string,
    deviceId: string,
    facing: 'FRONT' | 'BACK',
  ) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId },
    });
    if (!device) {
      throw new NotFoundException('Device not found');
    }

    const updated = await this.prisma.device.update({
      where: { id: device.id },
      data: {
        capabilitiesJson: {
          ...this.capabilitiesRecord(device.capabilitiesJson),
          cameraFacing: facing,
        } as Prisma.InputJsonValue,
      },
      include: { branch: true },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'device.camera_facing',
      resourceType: 'Device',
      resourceId: device.id,
      metadata: { cameraFacing: facing },
    });

    this.events.emitToOrg(organizationId, 'device.camera', {
      deviceId: updated.id,
      cameraFacing: facing,
    });
    void this.recordings.rotateCamera(updated.id, facing);

    return this.withCameraFacing(updated);
  }

  async createPairingCode(
    organizationId: string,
    userId: string,
    dto: CreatePairingCodeDto,
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, organizationId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const code = this.generatePairingCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const pairing = await this.prisma.devicePairingCode.create({
      data: {
        code,
        organizationId,
        branchId: branch.id,
        deviceNameHint: dto.deviceNameHint,
        expiresAt,
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'device.pairing_code_created',
      resourceType: 'DevicePairingCode',
      resourceId: pairing.id,
      metadata: { branchId: branch.id },
    });

    return {
      id: pairing.id,
      code: pairing.code,
      expiresAt: pairing.expiresAt,
      branchId: pairing.branchId,
      deviceNameHint: pairing.deviceNameHint,
    };
  }

  async pairDevice(dto: PairDeviceDto) {
    const pairing = await this.prisma.devicePairingCode.findUnique({
      where: { code: dto.code.toUpperCase() },
    });

    if (!pairing || pairing.usedAt || pairing.expiresAt <= new Date()) {
      throw new BadRequestException('Invalid pairing code');
    }

    const apiKey = randomBytes(32).toString('hex');
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

    const device = await this.prisma.$transaction(async (tx) => {
      const created = await tx.device.create({
        data: {
          name: dto.name,
          organizationId: pairing.organizationId,
          branchId: pairing.branchId,
          status: DeviceStatus.ONLINE,
          lastSeen: new Date(),
          apiKeyHash,
          capabilitiesJson: (dto.capabilities ?? {}) as Prisma.InputJsonValue,
          appVersion: dto.appVersion,
          androidVersion: dto.androidVersion,
          deviceModel: dto.deviceModel,
        },
      });

      await tx.devicePairingCode.update({
        where: { id: pairing.id },
        data: { usedAt: new Date(), deviceId: created.id },
      });

      return created;
    });

    const deviceToken = await this.jwt.signAsync(
      {
        sub: device.id,
        organizationId: device.organizationId,
        branchId: device.branchId,
        typ: 'device',
      },
      {
        secret: this.config.getOrThrow<string>('DEVICE_JWT_SECRET'),
        expiresIn: (this.config.get<string>('DEVICE_JWT_EXPIRES_IN') ??
          '30d') as `${number}d`,
      },
    );

    await this.audit.log({
      organizationId: device.organizationId,
      action: 'device.paired',
      resourceType: 'Device',
      resourceId: device.id,
      metadata: { name: device.name },
    });

    this.events.emitToOrg(device.organizationId, 'device.online', {
      deviceId: device.id,
      status: DeviceStatus.ONLINE,
      lastSeen: device.lastSeen?.toISOString(),
    });

    return {
      deviceId: device.id,
      name: device.name,
      organizationId: device.organizationId,
      branchId: device.branchId,
      deviceToken,
      apiKey,
    };
  }

  async updateStatusFromDevice(
    deviceId: string,
    organizationId: string,
    dto: DeviceStatusDto,
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

    const status = this.parseStatus(dto.status) ?? device.status;
    const networkType =
      this.parseNetwork(dto.networkType) ?? device.networkType;

    const updated = await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        status,
        lastSeen: new Date(),
        batteryPercent: dto.batteryPercent ?? undefined,
        charging: dto.charging ?? undefined,
        batterySaver: dto.batterySaver ?? undefined,
        thermalState: dto.thermalState ?? undefined,
        networkType: networkType ?? undefined,
        networkQuality: dto.networkQuality ?? undefined,
        errorCode: dto.errorCode === undefined ? undefined : dto.errorCode,
        errorMessage:
          dto.errorMessage === undefined ? undefined : dto.errorMessage,
        appVersion: dto.appVersion ?? undefined,
        androidVersion: dto.androidVersion ?? undefined,
        deviceModel: dto.deviceModel ?? undefined,
        capabilitiesJson:
          dto.capabilities === undefined
            ? undefined
            : ({
                ...this.capabilitiesRecord(device.capabilitiesJson),
                ...dto.capabilities,
              } as Prisma.InputJsonValue),
      },
    });

    const payload = {
      deviceId: updated.id,
      status: updated.status,
      batteryPercent: updated.batteryPercent,
      charging: updated.charging,
      networkType: updated.networkType,
      networkQuality: updated.networkQuality,
      errorCode: updated.errorCode,
      errorMessage: updated.errorMessage,
      lastSeen: updated.lastSeen?.toISOString(),
      appVersion: updated.appVersion,
      androidVersion: updated.androidVersion,
      deviceModel: updated.deviceModel,
    };

    this.events.emitToOrg(organizationId, 'device.status', payload);

    if (status === DeviceStatus.STREAMING) {
      this.events.emitToOrg(organizationId, 'device.streaming', payload);
    }
    if (status === DeviceStatus.ERROR) {
      this.events.emitToOrg(organizationId, 'device.error', payload);
    }
    if (status === DeviceStatus.ONLINE || status === DeviceStatus.STREAMING) {
      this.events.emitToOrg(organizationId, 'device.online', payload);
    }
    if (status === DeviceStatus.OFFLINE) {
      this.events.emitToOrg(organizationId, 'device.offline', payload);
    }
    if (dto.batteryPercent !== undefined) {
      this.events.emitToOrg(organizationId, 'device.battery', payload);
    }
    if (dto.networkType !== undefined) {
      this.events.emitToOrg(organizationId, 'device.network', payload);
    }

    return this.withCameraFacing(updated);
  }

  async disableDevice(
    organizationId: string,
    userId: string,
    deviceId: string,
  ) {
    const device = await this.getForOrg(organizationId, deviceId);
    const updated = await this.prisma.device.update({
      where: { id: device.id },
      data: { disabled: true, status: DeviceStatus.OFFLINE },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'device.disabled',
      resourceType: 'Device',
      resourceId: device.id,
    });

    this.events.emitToOrg(organizationId, 'device.offline', {
      deviceId: device.id,
      status: DeviceStatus.OFFLINE,
    });

    return updated;
  }

  async deleteDevice(
    organizationId: string,
    userId: string,
    deviceId: string,
  ) {
    const device = await this.getForOrg(organizationId, deviceId);

    await this.prisma.device.delete({
      where: { id: device.id },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'device.deleted',
      resourceType: 'Device',
      resourceId: device.id,
      metadata: { name: device.name },
    });

    this.events.emitToOrg(organizationId, 'device.deleted', {
      deviceId: device.id,
    });

    return { ok: true };
  }

  async markStaleDevicesOffline() {
    const cutoff = new Date(Date.now() - 45_000);
    const stale = await this.prisma.device.findMany({
      where: {
        status: { not: DeviceStatus.OFFLINE },
        OR: [{ lastSeen: { lt: cutoff } }, { lastSeen: null }],
      },
    });

    for (const device of stale) {
      await this.prisma.device.update({
        where: { id: device.id },
        data: { status: DeviceStatus.OFFLINE },
      });
      this.events.emitToOrg(device.organizationId, 'device.offline', {
        deviceId: device.id,
        status: DeviceStatus.OFFLINE,
      });
    }
  }

  private generatePairingCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const bytes = randomBytes(6);
    for (let i = 0; i < 6; i++) {
      code += alphabet[bytes[i] % alphabet.length];
    }
    return code;
  }

  private parseStatus(value?: string): DeviceStatus | undefined {
    if (!value) return undefined;
    if (Object.values(DeviceStatus).includes(value as DeviceStatus)) {
      return value as DeviceStatus;
    }
    throw new BadRequestException('Invalid status');
  }

  private parseNetwork(value?: string): NetworkType | undefined {
    if (!value) return undefined;
    if (Object.values(NetworkType).includes(value as NetworkType)) {
      return value as NetworkType;
    }
    throw new BadRequestException('Invalid networkType');
  }

  private capabilitiesRecord(
    json: Prisma.JsonValue | null | undefined,
  ): Record<string, unknown> {
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      return { ...(json as Record<string, unknown>) };
    }
    return {};
  }

  private cameraFacingOf(
    json: Prisma.JsonValue | null | undefined,
  ): 'FRONT' | 'BACK' {
    return this.capabilitiesRecord(json).cameraFacing === 'FRONT'
      ? 'FRONT'
      : 'BACK';
  }

  private withCameraFacing<
    T extends { capabilitiesJson: Prisma.JsonValue | null },
  >(device: T) {
    return {
      ...device,
      cameraFacing: this.cameraFacingOf(device.capabilitiesJson),
    };
  }
}
