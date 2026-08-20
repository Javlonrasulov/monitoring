import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { DeviceAuthGuard } from '../auth/device-auth.guard';
import { CurrentDevice, CurrentUser } from '../auth/decorators';
import { SubscriptionsService } from './subscriptions.service';

class PurchasePlanDto {
  @ApiProperty({ example: 'PRO_PLUS' })
  @IsString()
  plan!: string;
}

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

  @Post('nowpayments/ipn')
  @HttpCode(200)
  ipn(
    @Headers('x-nowpayments-sig') signature: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.subscriptions.handleNowPaymentsIpn(signature, body);
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

  @Post('invoices')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  createInvoice(
    @CurrentDevice() device: { organizationId: string; deviceId: string },
    @Body() dto: PurchasePlanDto,
  ) {
    const plan = this.subscriptions.parsePlan(dto.plan);
    if (plan === 'TRIAL') {
      throw new BadRequestException('Use PRO or PRO_PLUS for card payment');
    }
    return this.subscriptions.createInvoice(
      device.organizationId,
      plan,
      device.deviceId,
    );
  }

  @Get('invoices/:id')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  getInvoice(
    @CurrentDevice() device: { organizationId: string },
    @Param('id') id: string,
  ) {
    return this.subscriptions.getInvoice(device.organizationId, id);
  }
}
