import { Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

export type SubscriptionView = {
  id: string | null;
  status: SubscriptionStatus | 'NONE';
  maxDevices: number;
  deviceCount: number;
  devicesUsed: string;
  expiresAt: string | null;
  startedAt: string | null;
  active: boolean;
};

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async forOrganization(organizationId: string): Promise<SubscriptionView> {
    const [sub, deviceCount] = await Promise.all([
      this.prisma.subscription.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.device.count({ where: { organizationId } }),
    ]);

    const status = this.effectiveStatus(sub?.status, sub?.expiresAt);
    const active = status === SubscriptionStatus.ACTIVE;
    const maxDevices = sub?.maxDevices ?? 2;

    return {
      id: sub?.id ?? null,
      status,
      maxDevices,
      deviceCount,
      devicesUsed: `${deviceCount} / ${maxDevices}`,
      expiresAt: sub?.expiresAt?.toISOString() ?? null,
      startedAt: sub?.startedAt?.toISOString() ?? null,
      active,
    };
  }

  async assertCanPair(organizationId: string) {
    const view = await this.forOrganization(organizationId);
    if (!view.active) {
      return { ok: false as const, reason: 'subscription_inactive' };
    }
    if (view.deviceCount >= view.maxDevices) {
      return { ok: false as const, reason: 'device_limit_reached' };
    }
    return { ok: true as const, view };
  }

  async list(organizationId: string) {
    return this.prisma.subscription.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async activateDemo(organizationId: string) {
    const expiresAt = new Date('2026-09-19T23:59:59.000Z');
    return this.prisma.subscription.create({
      data: {
        organizationId,
        status: SubscriptionStatus.ACTIVE,
        maxDevices: 2,
        startedAt: new Date(),
        expiresAt,
      },
    });
  }

  private effectiveStatus(
    status?: SubscriptionStatus | null,
    expiresAt?: Date | null,
  ): SubscriptionStatus | 'NONE' {
    if (!status) return 'NONE';
    if (status === SubscriptionStatus.ACTIVE && expiresAt && expiresAt <= new Date()) {
      return SubscriptionStatus.EXPIRED;
    }
    return status;
  }
}
