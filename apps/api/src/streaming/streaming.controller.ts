import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StreamingService } from './streaming.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeviceAuthGuard } from '../auth/device-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { CurrentDevice, CurrentUser } from '../auth/decorators';

@ApiTags('streaming')
@Controller('streaming')
export class StreamingController {
  constructor(private readonly streamingService: StreamingService) {}

  @Post('devices/:id/viewer-token')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiOperation({ summary: 'Issue short-lived WHEP viewer token' })
  viewerToken(
    @CurrentUser() user: { organizationId: string; userId: string },
    @Param('id') id: string,
  ) {
    return this.streamingService.issueViewerToken(
      user.organizationId,
      user.userId,
      id,
    );
  }

  @Post('publisher-token')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Issue short-lived WHIP publisher token' })
  publisherToken(
    @CurrentDevice()
    device: {
      deviceId: string;
      organizationId: string;
    },
  ) {
    return this.streamingService.issuePublisherToken(
      device.deviceId,
      device.organizationId,
    );
  }

  @Post('sessions/:id/end')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  endSession(
    @CurrentDevice() device: { organizationId: string },
    @Param('id') id: string,
  ) {
    return this.streamingService.endSession(id, device.organizationId);
  }

  @Post('mediamtx-auth')
  @HttpCode(200)
  @ApiOperation({ summary: 'MediaMTX external auth webhook' })
  async mediamtxAuth(@Body() body: Record<string, unknown>) {
    const text = (value: unknown) =>
      typeof value === 'string' ? value : value != null ? String(value) : undefined;
    const result = await this.streamingService.validateMediaMtxAuth({
      user: text(body.user),
      password: text(body.password),
      token: text(body.token),
      action: text(body.action),
      path: text(body.path),
      protocol: text(body.protocol),
      ip: text(body.ip),
    });
    if (!result.ok) {
      throw new ForbiddenException('Unauthorized stream access');
    }
    return { status: 'ok' };
  }
}
