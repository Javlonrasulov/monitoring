import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { seesAllOrganizations } from '../auth/platform-org';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async list(organizationId: string) {
    await this.repairSharedUserOrgs();

    const users = await this.prisma.user.findMany({
      where: seesAllOrganizations(organizationId)
        ? { email: { not: { endsWith: '@support.internal' } } }
        : { organizationId, email: { not: { endsWith: '@support.internal' } } },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        username: true,
        role: true,
        blocked: true,
        deviceId: true,
        organizationId: true,
        lastSeenAt: true,
        createdAt: true,
        device: { select: { id: true, name: true, status: true, lastSeen: true } },
        organization: {
          select: {
            id: true,
            name: true,
            subscriptions: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                plan: true,
                status: true,
                expiresAt: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((user) => {
      const sub = user.organization.subscriptions[0];
      const expired =
        sub?.status === 'ACTIVE' &&
        sub.expiresAt != null &&
        sub.expiresAt.getTime() <= Date.now();
      const planActive = sub?.status === 'ACTIVE' && !expired;
      return {
        ...user,
        plan: planActive ? sub.plan : sub?.plan ?? 'NONE',
        planStatus: expired ? 'EXPIRED' : (sub?.status ?? 'NONE'),
        planActive,
        planExpiresAt: sub?.expiresAt ?? null,
      };
    });
  }

  async setBlocked(
    actor: { organizationId: string; userId: string },
    id: string,
    blocked: boolean,
  ) {
    const target = await this.findTarget(actor.organizationId, id);
    if (target.id === actor.userId && blocked) {
      throw new ForbiddenException('You cannot block yourself');
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: { blocked },
    });
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: blocked ? 'user.blocked' : 'user.activated',
      resourceType: 'User',
      resourceId: id,
    });
    return { id: updated.id, blocked: updated.blocked };
  }

  async remove(actor: { organizationId: string; userId: string }, id: string) {
    const target = await this.findTarget(actor.organizationId, id);
    if (target.id === actor.userId) {
      throw new ForbiddenException('You cannot delete yourself');
    }

    if (target.deviceId) {
      await this.prisma.device.delete({ where: { id: target.deviceId } }).catch(() => undefined);
    }

    await this.prisma.user.delete({ where: { id: target.id } });

    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'user.deleted',
      resourceType: 'User',
      resourceId: id,
      metadata: { name: target.name, email: target.email, role: target.role },
    });
    return { ok: true };
  }

  async grantPlan(
    actor: { organizationId: string; userId: string },
    id: string,
    plan: string,
  ) {
    await this.repairSharedUserOrgs();
    const target = await this.findTarget(actor.organizationId, id);
    const parsed = this.subscriptions.parsePlan(plan);
    const view = await this.subscriptions.grantManual(
      target.organizationId,
      parsed,
    );
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'user.subscription_granted',
      resourceType: 'User',
      resourceId: id,
      metadata: { plan: parsed, organizationId: target.organizationId },
    });
    return view;
  }

  /**
   * Older builds merged linked phones into one organization, so one Pro
   * activated everyone. Split linked joiner accounts back to personal orgs.
   */
  private async repairSharedUserOrgs() {
    const shared = await this.prisma.user.groupBy({
      by: ['organizationId'],
      where: { role: UserRole.USER },
      _count: { _all: true },
      having: { organizationId: { _count: { gt: 1 } } },
    });

    for (const row of shared) {
      const users = await this.prisma.user.findMany({
        where: { organizationId: row.organizationId, role: UserRole.USER },
        include: { device: true },
        orderBy: { createdAt: 'asc' },
      });
      if (users.length <= 1) continue;

      const root =
        users.find((u) => u.device && !u.device.linkedFromDeviceId) ?? users[0];

      for (const user of users) {
        if (user.id === root.id || !user.deviceId || !user.device) continue;
        await this.moveUserToPersonalOrg(user.id, user.deviceId, user.name);
      }
    }
  }

  private async moveUserToPersonalOrg(
    userId: string,
    deviceId: string,
    name: string,
  ) {
    const org = await this.prisma.organization.create({
      data: {
        name: name || 'User',
        branches: { create: { name: 'Main' } },
      },
      include: { branches: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    const branch = org.branches[0];
    if (!branch) {
      throw new BadRequestException('Branch not found');
    }

    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        organizationId: org.id,
        branchId: branch.id,
      },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { organizationId: org.id },
    });
    await this.subscriptions.ensureTrial(org.id);
  }

  private async findTarget(organizationId: string, id: string) {
    if (!id) {
      throw new BadRequestException('User id is required');
    }
    const target = await this.prisma.user.findFirst({
      where: seesAllOrganizations(organizationId)
        ? { id }
        : { id, organizationId },
    });
    if (!target) {
      throw new NotFoundException('User not found');
    }
    return target;
  }
}
