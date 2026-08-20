import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeviceAuthGuard } from '../auth/device-auth.guard';
import { CurrentDevice, CurrentUser } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterPushTokenDto, UnregisterPushTokenDto } from './push.dto';
import { PushService } from './push.service';

@ApiTags('push')
@Controller('push-tokens')
export class PushTokensController {
  constructor(private readonly push: PushService) {}

  @Put()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  register(
    @CurrentUser() user: { userId: string },
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.push.registerToken(user.userId, dto.token, dto.platform);
  }

  @Delete()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  unregister(@Body() dto: UnregisterPushTokenDto) {
    return this.push.unregisterToken(dto.token);
  }
}

@ApiTags('push')
@Controller('device-push-tokens')
export class DevicePushTokensController {
  constructor(
    private readonly push: PushService,
    private readonly prisma: PrismaService,
  ) {}

  @Put()
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  async register(
    @CurrentDevice() device: { deviceId: string; organizationId: string },
    @Body() dto: RegisterPushTokenDto,
  ) {
    const user = await this.prisma.user.findFirst({
      where: {
        deviceId: device.deviceId,
        organizationId: device.organizationId,
      },
      select: { id: true },
    });
    if (!user) {
      throw new ForbiddenException('No user account for this device');
    }
    return this.push.registerToken(user.id, dto.token, dto.platform);
  }

  @Delete()
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  unregister(@Body() dto: UnregisterPushTokenDto) {
    return this.push.unregisterToken(dto.token);
  }
}
