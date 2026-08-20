import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    const users = await this.prisma.user.findMany({
      where: seesAllOrganizations(organizationId)
        ? {}
        : { organizationId },
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
