import { BadRequestException, Injectable } from '@nestjs/common';
import { SubscriptionPlan, SubscriptionStatus } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { seesAllOrganizations } from '../auth/platform-org';

export type SubscriptionView = {
  id: string | null;
  status: SubscriptionStatus | 'NONE';
  plan: SubscriptionPlan | 'NONE';
  maxDevices: number;
  deviceCount: number;
  devicesUsed: string;
  expiresAt: string | null;
  startedAt: string | null;
  active: boolean;
  trial: boolean;
  canWatchVideo: boolean;
  canWatchAudio: boolean;
  canRecordings: boolean;
  canLinkTwoApps: boolean;
  priceProUsd: number;
  priceProPlusUsd: number;
};

const PRO_PRICE = 25;
const PRO_PLUS_PRICE = 25;
const TRIAL_HOURS = 24;
const PAID_DAYS = 30;

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async forOrganization(organizationId: string): Promise<SubscriptionView> {
    const [sub, deviceCount] = await Promise.all([
      this.prisma.subscription.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.device.count({
        where: { organizationId, disabled: false },
      }),
    ]);

    const status = this.effectiveStatus(sub?.status, sub?.expiresAt);
    const plan = sub?.plan ?? 'NONE';
    const active = status === SubscriptionStatus.ACTIVE;
    const maxDevices =
      sub?.maxDevices ??
      this.maxDevicesFor(plan === 'NONE' ? SubscriptionPlan.TRIAL : plan);
    const trial = active && plan === SubscriptionPlan.TRIAL;
    const canWatchVideo = active;
    const canWatchAudio = active && plan === SubscriptionPlan.PRO_PLUS;
    const canRecordings = canWatchAudio;
    const canLinkTwoApps = active;

    return {
      id: sub?.id ?? null,
      status,
      plan,
      maxDevices,
      deviceCount,
      devicesUsed: `${deviceCount} / ${maxDevices}`,
      expiresAt: sub?.expiresAt?.toISOString() ?? null,
      startedAt: sub?.startedAt?.toISOString() ?? null,
      active,
      trial,
      canWatchVideo,
      canWatchAudio,
      canRecordings,
      canLinkTwoApps,
      priceProUsd: PRO_PRICE,
      priceProPlusUsd: PRO_PLUS_PRICE,
    };
  }

  async assertCanPair(organizationId: string) {
    await this.ensureTrial(organizationId);
    const view = await this.forOrganization(organizationId);
    if (!view.active) {
      return { ok: false as const, reason: 'subscription_inactive' as const, view };
    }
    if (view.deviceCount >= view.maxDevices) {
      return { ok: false as const, reason: 'device_limit_reached' as const, view };
    }
    return { ok: true as const, view };
  }

  async assertCanWatch(
    organizationId: string,
    feature: 'video' | 'audio' | 'recordings' = 'video',
  ) {
    const view = await this.forOrganization(organizationId);
    if (!view.active || !view.canWatchVideo) {
      return { ok: false as const, reason: 'subscription_inactive' as const, view };
    }
    if (feature === 'audio' && !view.canWatchAudio) {
      return { ok: false as const, reason: 'upgrade_required' as const, view };
    }
    if (feature === 'recordings' && !view.canRecordings) {
      return { ok: false as const, reason: 'upgrade_required' as const, view };
    }
    return { ok: true as const, view };
  }

  async list(organizationId: string) {
    return this.prisma.subscription.findMany({
      where: seesAllOrganizations(organizationId) ? {} : { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async ensureTrial(organizationId: string) {
    const existing = await this.prisma.subscription.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;
    const now = new Date();
    return this.prisma.subscription.create({
      data: {
        organizationId,
        status: SubscriptionStatus.ACTIVE,
        plan: SubscriptionPlan.TRIAL,
        maxDevices: this.maxDevicesFor(SubscriptionPlan.TRIAL),
        startedAt: now,
        expiresAt: new Date(now.getTime() + TRIAL_HOURS * 60 * 60 * 1000),
      },
    });
  }

  async purchase(organizationId: string, plan: 'PRO' | 'PRO_PLUS') {
    const nextPlan =
      plan === 'PRO_PLUS' ? SubscriptionPlan.PRO_PLUS : SubscriptionPlan.PRO;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PAID_DAYS * 24 * 60 * 60 * 1000);
    return this.prisma.subscription.create({
      data: {
        organizationId,
        status: SubscriptionStatus.ACTIVE,
        plan: nextPlan,
        maxDevices: this.maxDevicesFor(nextPlan),
        startedAt: now,
        expiresAt,
      },
    });
  }

  async activateDemo(organizationId: string) {
    return this.purchase(organizationId, 'PRO_PLUS');
  }

  parsePlan(value?: string): 'PRO' | 'PRO_PLUS' {
    const plan = (value ?? '').trim().toUpperCase().replace('+', '_PLUS');
    if (plan === 'PRO_PLUS' || plan === 'PROPLUS') return 'PRO_PLUS';
    if (plan === 'PRO') return 'PRO';
    throw new BadRequestException('Plan must be PRO or PRO_PLUS');
  }

  private maxDevicesFor(plan: SubscriptionPlan | 'NONE') {
    if (plan === SubscriptionPlan.PRO || plan === SubscriptionPlan.PRO_PLUS) {
      return 2;
    }
    return 2;
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
