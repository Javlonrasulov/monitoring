import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { DeviceAuthGuard } from '../auth/device-auth.guard';
import { CurrentDevice, CurrentUser } from '../auth/decorators';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  list(@CurrentUser() user: { organizationId: string }) {
    return this.subscriptions.list(user.organizationId);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  meAdmin(@CurrentUser() user: { organizationId: string }) {
    return this.subscriptions.forOrganization(user.organizationId);
  }

  @Post('activate-demo')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  activate(@CurrentUser() user: { organizationId: string }) {
    return this.subscriptions.activateDemo(user.organizationId);
  }
}

@ApiTags('subscriptions')
@Controller('device-subscriptions')
export class DeviceSubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  meDevice(
    @CurrentDevice() device: { organizationId: string },
  ) {
    return this.subscriptions.forOrganization(device.organizationId);
  }
}
