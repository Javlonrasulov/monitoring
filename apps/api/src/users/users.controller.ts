import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { CurrentUser } from '../auth/decorators';
import { AuditService } from '../audit/audit.service';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminRoleGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@CurrentUser() user: { organizationId: string; userId: string }) {
    const rows = await this.users.list(user.organizationId);
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'users.list_viewed',
      resourceType: 'User',
    });
    return rows;
  }

  @Patch(':id/block')
  block(
    @CurrentUser() user: { organizationId: string; userId: string },
    @Param('id') id: string,
    @Body() body: { blocked?: boolean },
  ) {
    return this.users.setBlocked(user, id, body.blocked ?? true);
  }

  @Post(':id/subscription')
  grantPlan(
    @CurrentUser() user: { organizationId: string; userId: string },
    @Param('id') id: string,
    @Body() body: { plan?: string },
  ) {
    return this.users.grantPlan(user, id, body.plan ?? '');
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: { organizationId: string; userId: string },
    @Param('id') id: string,
  ) {
    return this.users.remove(user, id);
  }
}
