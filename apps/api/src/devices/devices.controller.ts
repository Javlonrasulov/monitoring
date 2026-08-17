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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeviceAuthGuard } from '../auth/device-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { CurrentDevice, CurrentUser } from '../auth/decorators';
import {
  CreatePairingCodeDto,
  DeviceStatusDto,
  PairDeviceDto,
  SetCameraFacingDto,
} from './dto/devices.dto';
import { AuditService } from '../audit/audit.service';

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devicesService: DevicesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiOperation({ summary: 'List devices for organization' })
  list(@CurrentUser() user: { organizationId: string }) {
    return this.devicesService.listForOrg(user.organizationId);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Device self: status and camera command' })
  me(
    @CurrentDevice()
    device: { deviceId: string; organizationId: string },
  ) {
    return this.devicesService.getMe(device.deviceId, device.organizationId);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiOperation({ summary: 'Get device by id' })
  async get(
    @CurrentUser() user: { organizationId: string; userId: string },
    @Param('id') id: string,
  ) {
    const device = await this.devicesService.getForOrg(user.organizationId, id);
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'device.viewed',
      resourceType: 'Device',
      resourceId: id,
    });
    return device;
  }

  @Post('pair')
  @ApiOperation({ summary: 'Pair device with pairing code (device endpoint)' })
  pair(@Body() dto: PairDeviceDto) {
    return this.devicesService.pairDevice(dto);
  }

  @Post('pairing-codes')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiOperation({ summary: 'Create pairing code' })
  createPairingCode(
    @CurrentUser() user: { organizationId: string; userId: string },
    @Body() dto: CreatePairingCodeDto,
  ) {
    return this.devicesService.createPairingCode(
      user.organizationId,
      user.userId,
      dto,
    );
  }

  @Post(':id/camera')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiOperation({ summary: 'Switch device camera facing (front/back)' })
  setCamera(
    @CurrentUser() user: { organizationId: string; userId: string },
    @Param('id') id: string,
    @Body() dto: SetCameraFacingDto,
  ) {
    return this.devicesService.setCameraFacing(
      user.organizationId,
      user.userId,
      id,
      dto.facing,
    );
  }

  @Post(':id/disable')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiOperation({ summary: 'Disable device' })
  disable(
    @CurrentUser() user: { organizationId: string; userId: string },
    @Param('id') id: string,
  ) {
    return this.devicesService.disableDevice(
      user.organizationId,
      user.userId,
      id,
    );
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiOperation({ summary: 'Delete device' })
  remove(
    @CurrentUser() user: { organizationId: string; userId: string },
    @Param('id') id: string,
  ) {
    return this.devicesService.deleteDevice(
      user.organizationId,
      user.userId,
      id,
    );
  }

  @Patch('me/status')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Device heartbeat / status update' })
  updateMyStatus(
    @CurrentDevice()
    device: { deviceId: string; organizationId: string },
    @Body() dto: DeviceStatusDto,
  ) {
    return this.devicesService.updateStatusFromDevice(
      device.deviceId,
      device.organizationId,
      dto,
    );
  }

  @Get(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiOperation({ summary: 'Get device status' })
  async status(
    @CurrentUser() user: { organizationId: string },
    @Param('id') id: string,
  ) {
    const device = await this.devicesService.getForOrg(user.organizationId, id);
    return {
      deviceId: device.id,
      status: device.status,
      batteryPercent: device.batteryPercent,
      charging: device.charging,
      batterySaver: device.batterySaver,
      thermalState: device.thermalState,
      networkType: device.networkType,
      networkQuality: device.networkQuality,
      errorCode: device.errorCode,
      errorMessage: device.errorMessage,
      lastSeen: device.lastSeen,
      appVersion: device.appVersion,
      androidVersion: device.androidVersion,
      deviceModel: device.deviceModel,
      disabled: device.disabled,
      cameraFacing: device.cameraFacing,
    };
  }
}
