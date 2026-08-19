import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DeviceStatus, NetworkType, Prisma, UserRole } from '../generated/prisma';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { AuditService } from '../audit/audit.service';
import { RecordingsService } from '../recordings/recordings.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ChatsService } from '../chats/chats.service';
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
    private readonly subscriptions: SubscriptionsService,
    private readonly chats: ChatsService,
  ) {}

  async listForOrg(organizationId: string) {
    const devices = await this.prisma.device.findMany({
      where: { organizationId },
      include: { branch: true, linkedUser: { select: { id: true, name: true, role: true, lastSeenAt: true } } },
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
    if (!dto.branchId) {
      throw new BadRequestException('branchId is required');
    }
    return this.issuePairingCode({
      organizationId,
      userId,
      branchId: dto.branchId,
      deviceNameHint: dto.deviceNameHint,
      ttlMs: 10 * 60 * 1000,
    });
  }

  async createPairingCodeForDevice(
    deviceId: string,
    organizationId: string,
    branchId: string,
    dto: CreatePairingCodeDto,
  ) {
    const linkedUser = await this.prisma.user.findFirst({
      where: { deviceId, organizationId, blocked: false },
    });
    return this.issuePairingCode({
      organizationId,
      userId: linkedUser?.id ?? deviceId,
      branchId: dto.branchId || branchId,
      deviceNameHint: dto.deviceNameHint,
      issuerDeviceId: deviceId,
      issuerUserId: linkedUser?.id,
      ttlMs: 24 * 60 * 60 * 1000,
    });
  }

  async listLinkedForDevice(deviceId: string, organizationId: string) {
    const devices = await this.prisma.device.findMany({
      where: {
        organizationId,
        linkedFromDeviceId: deviceId,
        disabled: false,
      },
      orderBy: { lastSeen: 'desc' },
    });
    return devices.map((device) => ({
      id: device.id,
      name: device.name,
      status: device.status,
      lastSeen: device.lastSeen,
      deviceModel: device.deviceModel,
    }));
  }

  async linkExistingDevice(
    deviceId: string,
    organizationId: string,
    rawCode: string,
  ) {
    const pairing = await this.findUsablePairing(rawCode);
    if (pairing.issuerDeviceId === deviceId) {
      throw new BadRequestException('Cannot link a device to itself');
    }

    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId },
    });
    if (!device) {
      throw new NotFoundException('Device not found');
    }

    if (device.organizationId !== pairing.organizationId) {
      const allowed = await this.subscriptions.assertCanPair(
        pairing.organizationId,
      );
      this.throwIfPairBlocked(allowed);
      await this.prisma.device.update({
        where: { id: device.id },
        data: {
          organizationId: pairing.organizationId,
          branchId: pairing.branchId,
        },
      });
      await this.prisma.user.updateMany({
        where: { deviceId: device.id },
        data: { organizationId: pairing.organizationId },
      });
    }

    await this.prisma.device.update({
      where: { id: device.id },
      data: { linkedFromDeviceId: pairing.issuerDeviceId ?? undefined },
    });
    await this.prisma.devicePairingCode.update({
      where: { id: pairing.id },
      data: { usedAt: new Date(), deviceId: device.id },
    });

    const peer = await this.prisma.user.findFirst({
      where: { deviceId: device.id },
    });
    if (peer) {
      await this.chats.ensureThreadForPairedDevice({
        organizationId: pairing.organizationId,
        deviceId: device.id,
        deviceName: device.name,
        peerUserId: peer.id,
        ownerUserId: pairing.issuerUserId,
      });
    }

    return {
      ok: true,
      linkedToDeviceId: pairing.issuerDeviceId ?? null,
      organizationId: pairing.organizationId,
    };
  }

  async pairDevice(dto: PairDeviceDto) {
    const phone = this.normalizePhone(dto.phone);
    const rawCode = (dto.code ?? '').replace(/^MONITOR:/i, '').trim();
    const code = rawCode ? rawCode.toUpperCase() : '';

    if (!code) {
      if (!phone) {
        throw new BadRequestException('Phone is required');
      }
      return this.pairByPhone(phone, dto);
    }

    const pairing = await this.findUsablePairing(code);

    const allowed = await this.subscriptions.assertCanPair(pairing.organizationId);
    this.throwIfPairBlocked(allowed);

    const displayName =
      dto.name?.trim() ||
      phone ||
      dto.deviceModel?.trim() ||
      'Device';

    return this.createPairedDevice({
      organizationId: pairing.organizationId,
      branchId: pairing.branchId,
      displayName,
      dto,
      phone,
      pairingId: pairing.id,
      linkedFromDeviceId: pairing.issuerDeviceId,
      ownerUserId: pairing.issuerUserId,
    });
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

  private async pairByPhone(phone: string, dto: PairDeviceDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        blocked: false,
        role: UserRole.USER,
        OR: [
          { phone },
          { username: phone },
          { name: phone },
          { email: `user-${phone}@device.local` },
        ],
      },
      include: { device: true },
      orderBy: { createdAt: 'asc' },
    });

    if (existing?.device && !existing.device.disabled) {
      return this.issueDeviceSession(existing.device, existing.id, dto);
    }
    if (existing?.device?.disabled) {
      throw new BadRequestException('Device disabled');
    }

    if (existing && !existing.deviceId) {
      const branch = await this.prisma.branch.findFirst({
        where: { organizationId: existing.organizationId },
        orderBy: { createdAt: 'asc' },
      });
      if (!branch) {
        throw new BadRequestException('Branch not found');
      }
      return this.createPairedDevice({
        organizationId: existing.organizationId,
        branchId: branch.id,
        displayName: dto.name?.trim() || phone,
        dto,
        phone,
        existingUserId: existing.id,
      });
    }

    const target = await this.resolveDefaultPairTarget();
    return this.createPairedDevice({
      organizationId: target.organizationId,
      branchId: target.branchId,
      displayName: dto.name?.trim() || phone,
      dto,
      phone,
    });
  }

  private async resolveDefaultPairTarget() {
    const preferredId =
      this.config.get<string>('DEFAULT_PAIR_ORG_ID') ?? 'seed-org';
    let org = await this.prisma.organization.findUnique({
      where: { id: preferredId },
      include: { branches: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    if (!org?.branches[0]) {
      org = await this.prisma.organization.findFirst({
        include: { branches: { orderBy: { createdAt: 'asc' }, take: 1 } },
        orderBy: { createdAt: 'asc' },
      });
    }
    if (!org?.branches[0]) {
      throw new BadRequestException('Organization not found');
    }

    const allowed = await this.subscriptions.assertCanPair(org.id);
    this.throwIfPairBlocked(allowed);

    return { organizationId: org.id, branchId: org.branches[0].id };
  }

  private async createPairedDevice(params: {
    organizationId: string;
    branchId: string;
    displayName: string;
    dto: PairDeviceDto;
    phone: string | null;
    pairingId?: string;
    existingUserId?: string;
    linkedFromDeviceId?: string | null;
    ownerUserId?: string | null;
  }) {
    const allowed = await this.subscriptions.assertCanPair(
      params.organizationId,
    );
    this.throwIfPairBlocked(allowed);

    const apiKey = randomBytes(32).toString('hex');
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

    const device = await this.prisma.$transaction(async (tx) => {
      const created = await tx.device.create({
        data: {
          name: params.displayName,
          organizationId: params.organizationId,
          branchId: params.branchId,
          status: DeviceStatus.ONLINE,
          lastSeen: new Date(),
          apiKeyHash,
          capabilitiesJson: (params.dto.capabilities ??
            {}) as Prisma.InputJsonValue,
          appVersion: params.dto.appVersion,
          androidVersion: params.dto.androidVersion,
          deviceModel: params.dto.deviceModel,
          linkedFromDeviceId: params.linkedFromDeviceId ?? undefined,
        },
      });

      if (params.pairingId) {
        await tx.devicePairingCode.update({
          where: { id: params.pairingId },
          data: { usedAt: new Date(), deviceId: created.id },
        });
      }

      return created;
    });

    const linkedUser = params.existingUserId
      ? await this.prisma.user.update({
          where: { id: params.existingUserId },
          data: {
            deviceId: device.id,
            phone: params.phone ?? undefined,
            name: params.displayName,
            username: params.displayName,
            lastSeenAt: new Date(),
          },
        })
      : await this.prisma.user.create({
          data: {
            email: params.phone
              ? `user-${params.phone}@device.local`
              : `user-${device.id}@device.local`,
            passwordHash: await bcrypt.hash(randomBytes(16).toString('hex'), 10),
            name: params.displayName,
            username: params.displayName,
            phone: params.phone,
            role: UserRole.USER,
            organizationId: device.organizationId,
            deviceId: device.id,
            lastSeenAt: new Date(),
          },
        });

    const deviceToken = await this.signDeviceToken(device);
    const thread = await this.chats.ensureThreadForPairedDevice({
      organizationId: device.organizationId,
      deviceId: device.id,
      deviceName: device.name,
      peerUserId: linkedUser.id,
      ownerUserId: params.ownerUserId,
    });

    await this.audit.log({
      organizationId: device.organizationId,
      action: 'device.paired',
      resourceType: 'Device',
      resourceId: device.id,
      metadata: {
        name: device.name,
        userId: linkedUser.id,
        via: params.pairingId ? 'code' : 'phone',
      },
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
      userId: linkedUser.id,
      threadId: thread?.id ?? null,
    };
  }

  private async issueDeviceSession(
    device: {
      id: string;
      name: string;
      organizationId: string;
      branchId: string;
    },
    userId: string,
    dto: PairDeviceDto,
  ) {
    const apiKey = randomBytes(32).toString('hex');
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        lastSeen: new Date(),
        apiKeyHash,
        appVersion: dto.appVersion ?? undefined,
        androidVersion: dto.androidVersion ?? undefined,
        deviceModel: dto.deviceModel ?? undefined,
      },
    });

    const deviceToken = await this.signDeviceToken(device);
    const thread = await this.prisma.chatThread.findFirst({
      where: { deviceId: device.id },
      select: { id: true },
    });

    return {
      deviceId: device.id,
      name: device.name,
      organizationId: device.organizationId,
      branchId: device.branchId,
      deviceToken,
      apiKey,
      userId,
      threadId: thread?.id ?? null,
    };
  }

  private signDeviceToken(device: {
    id: string;
    organizationId: string;
    branchId: string;
  }) {
    return this.jwt.signAsync(
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
  }

  private normalizePhone(value?: string | null): string | null {
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    if (digits.length < 9) return null;
    return digits;
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

  private async issuePairingCode(params: {
    organizationId: string;
    userId: string;
    branchId: string;
    deviceNameHint?: string;
    issuerDeviceId?: string;
    issuerUserId?: string;
    ttlMs: number;
  }) {
    const allowed = await this.subscriptions.assertCanPair(params.organizationId);
    this.throwIfPairBlocked(allowed);

    const branch = await this.prisma.branch.findFirst({
      where: { id: params.branchId, organizationId: params.organizationId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const code = this.generatePairingCode();
    const pairing = await this.prisma.devicePairingCode.create({
      data: {
        code,
        organizationId: params.organizationId,
        branchId: branch.id,
        deviceNameHint: params.deviceNameHint,
        issuerDeviceId: params.issuerDeviceId,
        issuerUserId: params.issuerUserId,
        expiresAt: new Date(Date.now() + params.ttlMs),
      },
    });

    await this.audit.log({
      organizationId: params.organizationId,
      userId: params.userId,
      action: 'device.pairing_code_created',
      resourceType: 'DevicePairingCode',
      resourceId: pairing.id,
      metadata: { branchId: branch.id, issuerDeviceId: params.issuerDeviceId },
    });

    return {
      id: pairing.id,
      code: pairing.code,
      expiresAt: pairing.expiresAt,
      branchId: pairing.branchId,
      deviceNameHint: pairing.deviceNameHint,
      qrPayload: `MONITOR:${pairing.code}`,
    };
  }

  private async findUsablePairing(rawCode: string) {
    const code = rawCode.replace(/^MONITOR:/i, '').trim().toUpperCase();
    const pairing = await this.prisma.devicePairingCode.findUnique({
      where: { code },
    });
    if (!pairing || pairing.usedAt || pairing.expiresAt <= new Date()) {
      throw new BadRequestException('Invalid pairing code');
    }
    return pairing;
  }

  private throwIfPairBlocked(
    allowed: Awaited<ReturnType<SubscriptionsService['assertCanPair']>>,
  ) {
    if (!allowed.ok) {
      throw new BadRequestException(
        allowed.reason === 'device_limit_reached'
          ? 'Device limit reached'
          : 'Subscription is not active',
      );
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
