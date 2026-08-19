import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeviceAuthGuard } from '../auth/device-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { CurrentDevice, CurrentUser } from '../auth/decorators';
import {
  CreatePairingCodeDto,
  DeviceStatusDto,
  LinkDeviceDto,
  PairDeviceDto,
  SetCameraFacingDto,
} from './dto/devices.dto';
import { AuditService } from '../audit/audit.service';
import { AvatarsService } from '../avatars/avatars.service';

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devicesService: DevicesService,
    private readonly audit: AuditService,
    private readonly avatars: AvatarsService,
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

  @Put('me/avatar')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Upload this user profile photo (JPEG)' })
  uploadAvatar(
    @CurrentDevice()
    device: { deviceId: string; organizationId: string },
    @Req() req: Request,
  ) {
    return this.avatars.saveForDevice(
      device.organizationId,
      device.deviceId,
      req,
    );
  }

  @Delete('me/avatar')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Remove this user profile photo' })
  deleteAvatar(
    @CurrentDevice()
    device: { deviceId: string; organizationId: string },
  ) {
    return this.avatars.deleteForDevice(device.organizationId, device.deviceId);
  }

  @Get('me/linked')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Devices linked to this account for live view' })
  linked(
    @CurrentDevice()
    device: { deviceId: string; organizationId: string },
  ) {
    return this.devicesService.listLinkedForDevice(
      device.deviceId,
      device.organizationId,
    );
  }

  @Post('me/pairing-codes')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Create a code so another app can link to this user' })
  createMyPairingCode(
    @CurrentDevice()
    device: { deviceId: string; organizationId: string; branchId: string },
    @Body() dto: CreatePairingCodeDto = {},
  ) {
    return this.devicesService.createPairingCodeForDevice(
      device.deviceId,
      device.organizationId,
      device.branchId,
      dto,
    );
  }

  @Post('me/link')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Enter a link code after sign-in' })
  link(
    @CurrentDevice()
    device: { deviceId: string; organizationId: string },
    @Body() dto: LinkDeviceDto,
  ) {
    return this.devicesService.linkExistingDevice(
      device.deviceId,
      device.organizationId,
      dto.code,
    );
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
