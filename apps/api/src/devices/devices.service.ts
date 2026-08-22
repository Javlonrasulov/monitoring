import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DeviceStatus, NetworkType, Prisma, UserRole } from '../generated/prisma';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { AuditService } from '../audit/audit.service';
import { RecordingsService } from '../recordings/recordings.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ChatsService } from '../chats/chats.service';
import {
  CreatePairingCodeDto,
  DeviceStatusDto,
  GuestSupportDto,
  PairDeviceDto,
} from './dto/devices.dto';
import { platformOrgId, seesAllOrganizations } from '../auth/platform-org';

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
      where: seesAllOrganizations(organizationId) ? {} : { organizationId },
      include: { branch: true, linkedUser: { select: { id: true, name: true, role: true, lastSeenAt: true } } },
      orderBy: { name: 'asc' },
    });
    return devices.map((device) => this.withCameraFacing(device));
  }

  async getForOrg(organizationId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: this.adminDeviceWhere(organizationId, deviceId),
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
    const user = await this.prisma.user.findFirst({
      where: { deviceId, organizationId },
      select: {
        id: true,
        name: true,
        phone: true,
        avatarKey: true,
        avatarUpdatedAt: true,
      },
    });
    return {
      id: device.id,
      status: device.status,
      cameraFacing: this.cameraFacingOf(device.capabilitiesJson),
      cameraFacingRev: this.cameraFacingRevOf(device.capabilitiesJson),
      userId: user?.id ?? null,
      name: user?.name ?? device.name,
      phone: user?.phone ?? null,
      hasAvatar: Boolean(user?.avatarKey),
      avatarUpdatedAt: user?.avatarUpdatedAt ?? null,
    };
  }

  async updateProfile(
    deviceId: string,
    organizationId: string,
    dto: { name?: string; phone?: string },
  ) {
    await this.getMe(deviceId, organizationId);
    const user = await this.prisma.user.findFirst({
      where: { deviceId, organizationId },
    });
    if (!user) {
      throw new ForbiddenException('No user account for this device');
    }

    const name =
      dto.name == null ? undefined : dto.name.trim();
    if (name !== undefined && (name.length < 1 || name.length > 80)) {
      throw new BadRequestException('Name is required');
    }

    let phone: string | undefined;
    if (dto.phone != null && String(dto.phone).trim() !== '') {
      const normalized = this.normalizePhone(dto.phone);
      if (!normalized) {
        throw new BadRequestException('Enter a valid phone number');
      }
      if (normalized !== user.phone) {
        const taken = await this.findUserByPhone(normalized);
        if (taken && taken.id !== user.id) {
          throw new ConflictException('This phone number is already in use');
        }
      }
      phone = normalized;
    }

    const nextName = name ?? user.name;
    const nextPhone = phone ?? user.phone ?? null;
    const email =
      phone && user.email.endsWith('@device.local')
        ? `user-${phone}@device.local`
        : undefined;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
      data: {
          name: nextName,
          username: nextName,
          ...(phone ? { phone } : {}),
          ...(email ? { email } : {}),
        },
      }),
      this.prisma.device.update({
        where: { id: deviceId },
        data: { name: nextName },
      }),
    ]);

    this.events.emitToOrg(organizationId, 'chat.profile', {
      userId: user.id,
      name: nextName,
      phone: nextPhone,
    });

    return this.getMe(deviceId, organizationId);
  }

  async changePassword(
    deviceId: string,
    organizationId: string,
    dto: { currentPassword: string; newPassword: string },
  ) {
    const user = await this.prisma.user.findFirst({
      where: { deviceId, organizationId },
    });
    if (!user) {
      throw new ForbiddenException('No user account for this device');
    }
    const current = this.parseAppPin(dto.currentPassword);
    const next = this.parseAppPin(dto.newPassword);
    if (current === next) {
      throw new BadRequestException('Choose a different password');
    }
    const matches = await bcrypt.compare(current, user.passwordHash);
    if (!matches) {
      throw new BadRequestException('Invalid password');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(next, 10),
        appPinSet: true,
      },
    });
    return { ok: true };
  }

  async setCameraFacing(
    organizationId: string,
    userId: string,
    deviceId: string,
    facing: 'FRONT' | 'BACK',
  ) {
    const device = await this.prisma.device.findFirst({
      where: this.adminDeviceWhere(organizationId, deviceId),
    });
    if (!device) {
      throw new NotFoundException('Device not found');
    }

    const caps = this.capabilitiesRecord(device.capabilitiesJson);
    const rev = Number(caps.cameraFacingRev);
    const updatedCaps = {
      ...caps,
      cameraFacing: facing,
      cameraFacingRev: (Number.isFinite(rev) ? rev : 0) + 1,
    };
    const updated = await this.prisma.device.update({
      where: { id: device.id },
        data: {
        capabilitiesJson: updatedCaps as Prisma.InputJsonValue,
      },
      include: { branch: true },
    });

    await this.audit.log({
      organizationId,
      userId: userId || undefined,
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
    branchId: string | undefined,
    dto: CreatePairingCodeDto,
  ) {
    const linkedUser = await this.prisma.user.findFirst({
      where: { deviceId, organizationId, blocked: false },
    });
    return this.issuePairingCode({
      organizationId,
      userId: linkedUser?.id,
      branchId: dto.branchId || branchId,
      deviceNameHint: dto.deviceNameHint,
      issuerDeviceId: deviceId,
      issuerUserId: linkedUser?.id,
      ttlMs: 24 * 60 * 60 * 1000,
    });
  }

  async listLinkedForDevice(deviceId: string, _organizationId: string) {
    const linkedToMe = await this.prisma.device.findMany({
      where: {
        linkedFromDeviceId: deviceId,
        disabled: false,
      },
    });
    return linkedToMe
      .sort((a, b) => {
        const at = a.lastSeen?.getTime() ?? 0;
        const bt = b.lastSeen?.getTime() ?? 0;
        return bt - at;
      })
      .map((device) => ({
        id: device.id,
        name: device.name,
        status: device.status,
        lastSeen: device.lastSeen,
        deviceModel: device.deviceModel,
        cameraFacing: this.cameraFacingOf(device.capabilitiesJson),
      }));
  }

  async setCameraFacingForLinkedDevice(
    viewerDeviceId: string,
    organizationId: string,
    targetDeviceId: string,
    facing: 'FRONT' | 'BACK',
  ) {
    const target = await this.requireMutualLink(viewerDeviceId, targetDeviceId);
    const viewerUser = await this.prisma.user.findFirst({
      where: { deviceId: viewerDeviceId, organizationId },
      select: { id: true },
    });
    return this.setCameraFacing(
      target.organizationId,
      viewerUser?.id ?? '',
      target.id,
      facing,
    );
  }

  async unlinkLinkedDevice(
    viewerDeviceId: string,
    organizationId: string,
    targetDeviceId: string,
  ) {
    const viewer = await this.prisma.device.findFirst({
      where: { id: viewerDeviceId },
    });
    const target = await this.prisma.device.findFirst({
      where: { id: targetDeviceId },
    });
    if (!viewer || !target) {
      throw new ForbiddenException('Device is not linked to this account');
    }

    // Issuer clears invitee link; invitee can disconnect from issuer.
    let clearedId: string | null = null;
    if (target.linkedFromDeviceId === viewerDeviceId) {
      await this.prisma.device.update({
        where: { id: target.id },
        data: { linkedFromDeviceId: null },
      });
      clearedId = target.id;
    } else if (viewer.linkedFromDeviceId === targetDeviceId) {
      await this.prisma.device.update({
        where: { id: viewer.id },
        data: { linkedFromDeviceId: null },
      });
      clearedId = viewer.id;
    } else {
      throw new ForbiddenException('Device is not linked to this account');
    }

    const viewerUser = await this.prisma.user.findFirst({
      where: { deviceId: viewerDeviceId, organizationId },
      select: { id: true },
    });
    await this.audit.log({
      organizationId,
      userId: viewerUser?.id,
      action: 'device.unlinked',
      resourceType: 'Device',
      resourceId: target.id,
      metadata: {
        fromDeviceId: viewerDeviceId,
        name: target.name,
        clearedDeviceId: clearedId,
      },
    });
    this.events.emitToOrg(organizationId, 'device.updated', {
      deviceId: target.id,
    });
    this.events.emitToOrg(target.organizationId, 'device.updated', {
      deviceId: target.id,
    });
    this.events.emitToOrg(viewer.organizationId, 'device.updated', {
      deviceId: viewer.id,
    });
    return { ok: true };
  }

  async linkExistingDevice(deviceId: string, rawCode: string) {
    const pairing = await this.findUsablePairing(rawCode);
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId },
    });
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    if (device.disabled) {
      throw new ForbiddenException('Device disabled');
    }
    const attached = await this.attachDeviceToInvite(device, pairing);
    const deviceToken = await this.signDeviceToken(attached);
    return {
      ok: true,
      linkedToDeviceId: pairing.issuerDeviceId,
      organizationId: attached.organizationId,
      branchId: attached.branchId,
      deviceId: attached.id,
      name: attached.name,
      deviceToken,
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

    const pin = this.parseAppPin(dto.password);
    const pairing = await this.findUsablePairing(code);
    let existingUserId: string | undefined;

    if (pairing.issuerDeviceId) {
      const existing = phone ? await this.findUserByPhone(phone) : null;
      if (existing) {
        await this.assertOrSetAppPin(existing, pin);
        if (existing.device?.disabled) {
          throw new BadRequestException('Device disabled');
        }
        if (existing.device) {
          const attached = await this.attachDeviceToInvite(
            existing.device,
            pairing,
          );
          return this.issueDeviceSession(attached, existing.id, dto);
        }
        existingUserId = existing.id;
      }
      await this.assertCanAcceptDeviceInvite(pairing.issuerDeviceId);

      const displayName =
        dto.name?.trim() ||
        phone ||
        dto.deviceModel?.trim() ||
        'Device';
      if (!existingUserId) {
        if (!phone) {
          throw new BadRequestException('Phone is required');
        }
        if (!dto.name?.trim()) {
          throw new BadRequestException('Name is required');
        }
        await this.subscriptions.assertInstallMayCreateAccount(
          dto.installId,
          dto.installSignals,
        );
        const target = await this.createAccountForPhone(phone, displayName);
        try {
          return this.createPairedDevice({
            organizationId: target.organizationId,
            branchId: target.branchId,
            displayName,
            dto,
            phone,
            pairingId: pairing.id,
            linkedFromDeviceId: pairing.issuerDeviceId,
            ownerUserId: pairing.issuerUserId,
            skipOrgDeviceLimit: true,
            claimTrialInstall: false,
          });
        } catch (error) {
          await this.cleanupFailedSignup(target.organizationId);
          throw error;
        }
      }

      // Existing user without device: stay on their org, only link.
      const home =
        existingUserId
          ? await this.prisma.user.findUnique({ where: { id: existingUserId } })
          : null;
      if (!home) {
        throw new NotFoundException('User not found');
      }
      const homeBranch =
        (await this.prisma.branch.findFirst({
          where: { organizationId: home.organizationId },
          orderBy: { createdAt: 'asc' },
        })) ?? null;
      if (!homeBranch) {
        throw new BadRequestException('Branch not found');
      }
      return this.createPairedDevice({
        organizationId: home.organizationId,
        branchId: homeBranch.id,
        displayName,
        dto,
        phone,
        pairingId: pairing.id,
        existingUserId,
        linkedFromDeviceId: pairing.issuerDeviceId,
        ownerUserId: pairing.issuerUserId,
        skipOrgDeviceLimit: true,
      });
    }

    await this.assertPairingPassword(pairing, phone, pin);
    const allowed = await this.subscriptions.assertCanPair(
      pairing.organizationId,
    );
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
      existingUserId,
      linkedFromDeviceId: pairing.issuerDeviceId,
      ownerUserId: pairing.issuerUserId,
      skipOrgDeviceLimit: false,
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
    const pin = this.parseAppPin(dto.password);
    const existing = await this.findUserByPhone(phone);

    if (existing?.device && !existing.device.disabled) {
      await this.assertOrSetAppPin(existing, pin);
      return this.issueDeviceSession(existing.device, existing.id, dto);
    }
    if (existing?.device?.disabled) {
      await this.assertOrSetAppPin(existing, pin);
      await this.prisma.device.update({
        where: { id: existing.device.id },
        data: { disabled: false, status: DeviceStatus.ONLINE },
      });
      return this.issueDeviceSession(existing.device, existing.id, dto);
    }

    // Phone account kept after device delete — recreate device, do not wipe user.
    if (existing && !existing.deviceId) {
      await this.assertOrSetAppPin(existing, pin);
      const displayName =
        dto.name?.trim() || existing.name?.trim() || phone;
      const homeBranch = await this.prisma.branch.findFirst({
        where: { organizationId: existing.organizationId },
        orderBy: { createdAt: 'asc' },
      });
      if (!homeBranch) {
        throw new BadRequestException('Branch not found');
      }
      return this.createPairedDevice({
        organizationId: existing.organizationId,
        branchId: homeBranch.id,
        displayName,
        dto,
        phone,
        existingUserId: existing.id,
        skipOrgDeviceLimit: true,
      });
    }

    const displayName = dto.name?.trim();
    if (!displayName) {
      throw new BadRequestException('Name is required');
    }

    await this.subscriptions.assertInstallMayCreateAccount(
      dto.installId,
      dto.installSignals,
    );

    const target = await this.createAccountForPhone(phone, displayName);
    try {
      const trial = await this.subscriptions.ensureTrial(target.organizationId);
      const expiresAt =
        trial.expiresAt ?? new Date(Date.now() + 72 * 60 * 60 * 1000);
      await this.subscriptions.claimTrialForInstall(
        dto.installId,
        target.organizationId,
        expiresAt,
        dto.installSignals,
      );
      return this.createPairedDevice({
        organizationId: target.organizationId,
        branchId: target.branchId,
        displayName,
        dto,
        phone,
        claimTrialInstall: false,
      });
    } catch (error) {
      await this.cleanupFailedSignup(target.organizationId);
      throw error;
    }
  }

  async pairStatus(
    rawPhone?: string,
    rawInstallId?: string,
    rawSignals?: string | string[],
  ) {
    const phone = this.normalizePhone(rawPhone);
    const existing = phone ? await this.findUserByPhone(phone) : null;
    const signals = Array.isArray(rawSignals)
      ? rawSignals
      : (rawSignals ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
    const trial = await this.subscriptions.trialStatusForInstall(
      rawInstallId,
      signals,
    );
    return {
      exists: Boolean(existing),
      requiresPassword: Boolean(existing),
      trialBlocked: trial.trialBlocked && !existing,
      trialEnded: trial.trialEnded && !existing,
      existingPhone: existing ? null : trial.existingPhone,
      existingName: existing ? null : trial.existingName,
      message: existing ? null : trial.message,
    };
  }

  /**
   * Open Call Center without phone/password (login problems).
   * Reuses a guest device keyed by installId so the same browser/phone
   * keeps one support thread.
   */
  async openGuestSupport(dto: GuestSupportDto) {
    const primary =
      this.subscriptions.normalizeInstallId(dto.installId) ??
      this.subscriptions.collectInstallKeys(dto.installId, dto.installSignals)[0];
    if (!primary) {
      throw new BadRequestException('Device id required');
    }

    const guestEmail = `guest-${createHash('sha256')
      .update(primary)
      .digest('hex')
      .slice(0, 24)}@guest.local`;
    const displayName = (dto.name?.trim() || 'Guest').slice(0, 48);

    let user = await this.prisma.user.findFirst({
      where: { email: guestEmail, role: UserRole.USER, blocked: false },
      include: { device: true },
      orderBy: { createdAt: 'asc' },
    });

    if (user?.device?.disabled) {
      await this.prisma.device.update({
        where: { id: user.device.id },
        data: { disabled: false, status: DeviceStatus.ONLINE },
      });
      user = await this.prisma.user.findFirst({
        where: { id: user.id },
        include: { device: true },
      });
    }

    if (user?.device) {
      const session = await this.issueGuestSession(user.device, user.id, dto, primary);
      const thread = await this.chats.openSupportForDevice(
        user.organizationId,
        user.device.id,
      );
      return { ...session, threadId: thread.id, guest: true };
    }

    if (user && !user.deviceId) {
      const branch = await this.prisma.branch.findFirst({
        where: { organizationId: user.organizationId },
        orderBy: { createdAt: 'asc' },
      });
      if (!branch) {
        throw new BadRequestException('Branch not found');
      }
      const apiKey = randomBytes(32).toString('hex');
      const apiKeyHash = await bcrypt.hash(apiKey, 10);
      const device = await this.prisma.device.create({
        data: {
          name: displayName,
          organizationId: user.organizationId,
          branchId: branch.id,
          status: DeviceStatus.ONLINE,
          lastSeen: new Date(),
          apiKeyHash,
          appVersion: dto.appVersion,
          androidVersion: dto.androidVersion,
          deviceModel: dto.deviceModel,
          installId: primary,
          capabilitiesJson: {
            cameraFacing: 'FRONT',
            cameraFacingRev: 1,
            guest: true,
          } as Prisma.InputJsonValue,
        },
      });
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          deviceId: device.id,
          name: displayName,
          username: displayName,
          lastSeenAt: new Date(),
        },
      });
      const deviceToken = await this.signDeviceToken(device);
      const thread = await this.chats.openSupportForDevice(
        user.organizationId,
        device.id,
      );
      return {
        deviceId: device.id,
        name: device.name,
        organizationId: device.organizationId,
        branchId: device.branchId,
        deviceToken,
        apiKey,
        userId: user.id,
        threadId: thread.id,
        guest: true,
      };
    }

    const org = await this.prisma.organization.create({
      data: {
        name: `Guest ${primary.slice(0, 10)}`,
        branches: { create: { name: 'Main' } },
      },
      include: { branches: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    const branch = org.branches[0];
    if (!branch) {
      throw new BadRequestException('Branch not found');
    }

    const apiKey = randomBytes(32).toString('hex');
    const apiKeyHash = await bcrypt.hash(apiKey, 10);
    const device = await this.prisma.device.create({
      data: {
        name: displayName,
        organizationId: org.id,
        branchId: branch.id,
        status: DeviceStatus.ONLINE,
        lastSeen: new Date(),
        apiKeyHash,
        appVersion: dto.appVersion,
        androidVersion: dto.androidVersion,
        deviceModel: dto.deviceModel,
        installId: primary,
        capabilitiesJson: {
          cameraFacing: 'FRONT',
          cameraFacingRev: 1,
          guest: true,
        } as Prisma.InputJsonValue,
      },
    });

    const createdUser = await this.prisma.user.create({
      data: {
        email: guestEmail,
        passwordHash: await bcrypt.hash(randomBytes(16).toString('hex'), 10),
        appPinSet: false,
        name: displayName,
        username: displayName,
        phone: null,
        role: UserRole.USER,
        organizationId: org.id,
        deviceId: device.id,
        lastSeenAt: new Date(),
      },
    });

    await this.audit.log({
      organizationId: org.id,
      action: 'device.guest_support',
      resourceType: 'Device',
      resourceId: device.id,
      metadata: { installId: primary, userId: createdUser.id },
    });

    const deviceToken = await this.signDeviceToken(device);
    const thread = await this.chats.openSupportForDevice(org.id, device.id);
    return {
      deviceId: device.id,
      name: device.name,
      organizationId: device.organizationId,
      branchId: device.branchId,
      deviceToken,
      apiKey,
      userId: createdUser.id,
      threadId: thread.id,
      guest: true,
    };
  }

  private async issueGuestSession(
    device: {
      id: string;
      name: string;
      organizationId: string;
      branchId: string;
    },
    userId: string,
    dto: GuestSupportDto,
    installId: string,
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
        installId,
        status: DeviceStatus.ONLINE,
      },
    });
    const deviceToken = await this.signDeviceToken(device);
    return {
      deviceId: device.id,
      name: device.name,
      organizationId: device.organizationId,
      branchId: device.branchId,
      deviceToken,
      apiKey,
      userId,
      threadId: null as string | null,
    };
  }

  private async assertPairingPassword(
    pairing: { issuerUserId: string | null },
    phone: string | null,
    pin: string,
  ) {
    if (pairing.issuerUserId) {
      const owner = await this.prisma.user.findUnique({
        where: { id: pairing.issuerUserId },
      });
      if (owner) {
        await this.assertOrSetAppPin(owner, pin);
        return;
      }
    }
    if (phone) {
      const existing = await this.findUserByPhone(phone);
      if (existing) {
        await this.assertOrSetAppPin(existing, pin);
      }
    }
  }

  private async findUserByPhone(phone: string) {
    return this.prisma.user.findFirst({
      where: {
        blocked: false,
        role: UserRole.USER,
        organizationId: { not: 'seed-org' },
        OR: [{ phone }, { email: `user-${phone}@device.local` }],
      },
      include: { device: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async cleanupFailedSignup(organizationId: string) {
    if (organizationId === platformOrgId()) {
      return;
    }
    await this.prisma.trialDeviceClaim
      .deleteMany({ where: { organizationId } })
      .catch(() => undefined);
    await this.prisma.subscription
      .deleteMany({ where: { organizationId } })
      .catch(() => undefined);
    const [users, devices] = await Promise.all([
      this.prisma.user.count({ where: { organizationId } }),
      this.prisma.device.count({ where: { organizationId } }),
    ]);
    if (users === 0 && devices === 0) {
      await this.prisma.organization
        .delete({ where: { id: organizationId } })
        .catch(() => undefined);
    }
  }

  private async createAccountForPhone(phone: string, displayName: string) {
    const org = await this.prisma.organization.create({
      data: {
        name: displayName,
        branches: { create: { name: 'Main' } },
      },
      include: { branches: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    const branch = org.branches[0];
    if (!branch) {
      throw new BadRequestException('Branch not found');
    }
    return { organizationId: org.id, branchId: branch.id };
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
    skipOrgDeviceLimit?: boolean;
    claimTrialInstall?: boolean;
  }) {
    if (!params.skipOrgDeviceLimit) {
      const allowed = await this.subscriptions.assertCanPair(
        params.organizationId,
      );
      this.throwIfPairBlocked(allowed);
    } else if (!params.linkedFromDeviceId) {
      await this.subscriptions.ensureTrial(params.organizationId);
    }

    const installId = this.subscriptions.normalizeInstallId(
      params.dto.installId,
    );

    if (params.claimTrialInstall) {
      const trial = await this.subscriptions.ensureTrial(params.organizationId);
      const expiresAt =
        trial.expiresAt ??
        new Date(Date.now() + 72 * 60 * 60 * 1000);
      await this.subscriptions.claimTrialForInstall(
        installId,
        params.organizationId,
        expiresAt,
        params.dto.installSignals,
      );
    }

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
          capabilitiesJson: {
            ...this.capabilitiesRecord(
              (params.dto.capabilities ?? {}) as Prisma.JsonValue,
            ),
            cameraFacing: 'FRONT',
            cameraFacingRev: 1,
          } as Prisma.InputJsonValue,
          appVersion: params.dto.appVersion,
          androidVersion: params.dto.androidVersion,
          deviceModel: params.dto.deviceModel,
          installId: installId ?? undefined,
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
            organizationId: device.organizationId,
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
            passwordHash: await bcrypt.hash(
              params.dto.password
                ? this.parseAppPin(params.dto.password)
                : randomBytes(16).toString('hex'),
              10,
            ),
            appPinSet: Boolean(params.dto.password),
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
    const installId = this.subscriptions.normalizeInstallId(dto.installId);

    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        lastSeen: new Date(),
        apiKeyHash,
        appVersion: dto.appVersion ?? undefined,
        androidVersion: dto.androidVersion ?? undefined,
        deviceModel: dto.deviceModel ?? undefined,
        installId: installId ?? undefined,
      },
    });

    await this.subscriptions
      .syncTrialSignalsForOrganization(
        device.organizationId,
        dto.installId,
        dto.installSignals,
      )
      .catch(() => undefined);

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
          '365d') as `${number}d`,
      },
    );
  }

  private parseAppPin(value?: string | null): string {
    const pin = (value ?? '').trim();
    if (!/^\d{4,12}$/.test(pin)) {
      throw new BadRequestException(
        'Password must be at least 4 digits',
      );
    }
    return pin;
  }

  private async assertOrSetAppPin(
    user: { id: string; passwordHash: string; appPinSet: boolean },
    pin: string,
  ) {
    if (!user.appPinSet) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await bcrypt.hash(pin, 10),
          appPinSet: true,
        },
      });
      return;
    }
    const matches = await bcrypt.compare(pin, user.passwordHash);
    if (!matches) {
      throw new BadRequestException('Invalid password');
    }
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
    const linkedUser = await this.prisma.user.findFirst({
      where: { deviceId: device.id },
    });

    await this.audit.log({
      organizationId,
      userId: userId || undefined,
      action: 'device.deleted',
      resourceType: 'Device',
      resourceId: device.id,
      metadata: {
        name: device.name,
        phone: linkedUser?.phone ?? null,
        // Keep phone login — only the device row is removed.
        preservedUserId: linkedUser?.id ?? null,
        deviceOrganizationId: device.organizationId,
      },
    });

    // Detach user first so ON DELETE SET NULL is explicit; never wipe the account.
    if (linkedUser) {
      await this.prisma.user.update({
        where: { id: linkedUser.id },
        data: { deviceId: null },
      });
    }
    await this.prisma.device.delete({ where: { id: device.id } });
    await this.deleteOrgIfEmpty(device.organizationId);

    this.events.emitToOrg(organizationId, 'device.deleted', {
      deviceId: device.id,
    });
    if (device.organizationId !== organizationId) {
      this.events.emitToOrg(device.organizationId, 'device.deleted', {
        deviceId: device.id,
      });
    }

    return { ok: true };
  }

  private async deleteOrgIfEmpty(organizationId: string) {
    if (organizationId === platformOrgId()) {
      return;
    }
    const [users, devices] = await Promise.all([
      this.prisma.user.count({ where: { organizationId } }),
      this.prisma.device.count({ where: { organizationId } }),
    ]);
    if (users === 0 && devices === 0) {
      await this.prisma.organization.delete({ where: { id: organizationId } });
    }
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
    userId?: string;
    branchId?: string;
    deviceNameHint?: string;
    issuerDeviceId?: string;
    issuerUserId?: string;
    ttlMs: number;
  }) {
    await this.subscriptions.assertMayIssuePairingCode(
      await this.subscriptions.forOrganization(params.organizationId),
    );

    const branch =
      (params.branchId
        ? await this.prisma.branch.findFirst({
            where: {
              id: params.branchId,
              organizationId: params.organizationId,
            },
          })
        : null) ??
      (await this.prisma.branch.findFirst({
        where: { organizationId: params.organizationId },
        orderBy: { createdAt: 'asc' },
      }));
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const code = this.generatePairingCode();
    const expiresAt = new Date(Date.now() + params.ttlMs);
    const baseData = {
      code,
      organizationId: params.organizationId,
      branchId: branch.id,
      deviceNameHint: params.deviceNameHint,
      expiresAt,
    };
    let pairing = null as Awaited<
      ReturnType<typeof this.prisma.devicePairingCode.create>
    > | null;
    for (let attempt = 0; attempt < 6 && !pairing; attempt++) {
      const nextCode = attempt === 0 ? code : this.generatePairingCode();
      pairing = await this.prisma.devicePairingCode
        .create({
          data: {
            ...baseData,
            code: nextCode,
            issuerDeviceId: params.issuerDeviceId,
            issuerUserId: params.issuerUserId,
          },
        })
        .catch(() => null);
    }
    if (!pairing) {
      throw new BadRequestException('Could not create pairing code');
    }

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

  private async attachDeviceToInvite(
    device: {
      id: string;
      name: string;
      organizationId: string;
      branchId: string;
      disabled: boolean;
    },
    pairing: {
      id: string;
      organizationId: string;
      branchId: string;
      issuerDeviceId: string | null;
      issuerUserId: string | null;
    },
  ) {
    if (!pairing.issuerDeviceId) {
      throw new BadRequestException('Invalid pairing code');
    }
    if (pairing.issuerDeviceId === device.id) {
      throw new BadRequestException('Cannot link a device to itself');
    }
    if (device.disabled) {
      throw new ForbiddenException('Device disabled');
    }
    await this.assertCanAcceptDeviceInvite(pairing.issuerDeviceId, device.id);
    // Keep each account on its own organization so subscriptions stay separate.
    // Linking only sets linkedFromDeviceId for live view.
    const updated = await this.prisma.device.update({
      where: { id: device.id },
      data: {
        linkedFromDeviceId: pairing.issuerDeviceId,
      },
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
    this.events.emitToOrg(device.organizationId, 'device.updated', {
      deviceId: updated.id,
    });
    this.events.emitToOrg(pairing.organizationId, 'device.updated', {
      deviceId: updated.id,
    });
    return updated;
  }

  private async assertCanAcceptDeviceInvite(
    issuerDeviceId: string,
    ignoreDeviceId?: string,
  ) {
    const issuer = await this.prisma.device.findFirst({
      where: { id: issuerDeviceId, disabled: false },
    });
    if (!issuer) {
      throw new BadRequestException('Invalid pairing code');
    }
    await this.subscriptions.ensureWatcherTrial(issuer.organizationId);
    const view = await this.subscriptions.forOrganization(
      issuer.organizationId,
    );
    if (!view.active) {
      throw new BadRequestException('Subscription is not active');
    }
    const linkedCount = await this.prisma.device.count({
      where: {
        disabled: false,
        ...(ignoreDeviceId ? { id: { not: ignoreDeviceId } } : {}),
        OR: [
          { id: issuerDeviceId },
          { linkedFromDeviceId: issuerDeviceId },
        ],
      },
    });
    if (linkedCount >= 2) {
      throw new BadRequestException('Device limit reached');
    }
  }

  /**
   * Live visibility is one-way: only the pairing-code issuer may watch linked devices.
   * Storage: invitee.linkedFromDeviceId = issuer.
   */
  private async requireMutualLink(viewerDeviceId: string, targetDeviceId: string) {
    if (viewerDeviceId === targetDeviceId) {
      throw new BadRequestException('Cannot target own device');
    }
    const target = await this.prisma.device.findFirst({
      where: { id: targetDeviceId },
    });
    if (!target || target.disabled) {
      throw new ForbiddenException('Device is not linked to this account');
    }
    if (target.linkedFromDeviceId !== viewerDeviceId) {
      throw new ForbiddenException('Device is not linked to this account');
    }
    return target;
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

  private adminDeviceWhere(organizationId: string, deviceId: string) {
    return seesAllOrganizations(organizationId)
      ? { id: deviceId }
      : { id: deviceId, organizationId };
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
    return this.capabilitiesRecord(json).cameraFacing === 'BACK'
      ? 'BACK'
      : 'FRONT';
  }

  private cameraFacingRevOf(
    json: Prisma.JsonValue | null | undefined,
  ): number {
    const rev = Number(this.capabilitiesRecord(json).cameraFacingRev);
    return Number.isFinite(rev) ? rev : 0;
  }

  private withCameraFacing<
    T extends { capabilitiesJson: Prisma.JsonValue | null },
  >(device: T) {
    return {
      ...device,
      cameraFacing: this.cameraFacingOf(device.capabilitiesJson),
      cameraFacingRev: this.cameraFacingRevOf(device.capabilitiesJson),
    };
  }
}
