import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { CurrentUser } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminRoleGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@CurrentUser() user: { organizationId: string; userId: string }) {
    const users = await this.prisma.user.findMany({
      where: { organizationId: user.organizationId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        username: true,
        role: true,
        blocked: true,
        deviceId: true,
        lastSeenAt: true,
        createdAt: true,
        device: { select: { id: true, name: true, status: true, lastSeen: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'users.list_viewed',
      resourceType: 'User',
    });
    return users;
  }

  @Patch(':id/block')
  async block(
    @CurrentUser() user: { organizationId: string; userId: string },
    @Param('id') id: string,
    @Body() body: { blocked?: boolean },
  ) {
    const target = await this.prisma.user.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!target) {
      return { ok: false };
    }
    const blocked = body.blocked ?? true;
    const updated = await this.prisma.user.update({
      where: { id },
      data: { blocked },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: blocked ? 'user.blocked' : 'user.activated',
      resourceType: 'User',
      resourceId: id,
    });
    return { id: updated.id, blocked: updated.blocked };
  }
}
