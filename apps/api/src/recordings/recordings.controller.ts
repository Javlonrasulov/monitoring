import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { RecordingsService } from './recordings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { DeviceAuthGuard } from '../auth/device-auth.guard';
import { CurrentDevice, CurrentUser } from '../auth/decorators';
import {
  DeleteRangeDto,
  DeleteRecordingsDto,
  ExportRecordingsDto,
  ListRecordingsDto,
  StartRecordingDto,
  StopRecordingDto,
  UpdateRecordingSettingsDto,
} from './dto/recordings.dto';

type AdminUser = {
  organizationId: string;
  userId: string;
  role: string;
};

@ApiTags('recordings')
@Controller('recordings')
export class RecordingsController {
  constructor(private readonly recordings: RecordingsService) {}

  @Post('device/playback-url')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Playback URL for a linked-device recording (Pro+)' })
  devicePlayback(
    @CurrentDevice() device: { deviceId: string; organizationId: string },
    @Body() body: { id?: string; recordingId?: string },
  ) {
    const recordingId = body.id ?? body.recordingId;
    if (!recordingId) {
      throw new BadRequestException('Recording id required');
    }
    return this.recordings.playbackTokenForLinkedViewer(
      device.deviceId,
      device.organizationId,
      device.deviceId,
      recordingId,
    );
  }

  @Get('device/:deviceId')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Pro+ linked-device recordings (last 3 days)' })
  deviceList(
    @CurrentDevice() device: { deviceId: string; organizationId: string },
    @Param('deviceId') deviceId: string,
  ) {
    return this.recordings.listForLinkedViewer(
      device.deviceId,
      device.organizationId,
      deviceId,
    );
  }

  @Post('device/:deviceId/start')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Start recording a linked device (Pro+)' })
  deviceStart(
    @CurrentDevice() device: { deviceId: string; organizationId: string },
    @Param('deviceId') deviceId: string,
  ) {
    return this.recordings.startForLinkedViewer(
      device.deviceId,
      device.organizationId,
      deviceId,
    );
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  list(@CurrentUser() user: AdminUser, @Query() query: ListRecordingsDto) {
    return this.recordings.list(user.organizationId, query);
  }

  @Get('timeline')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  timeline(@CurrentUser() user: AdminUser, @Query() query: ListRecordingsDto) {
    return this.recordings.timeline(user.organizationId, query);
  }

  @Get('storage')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  storage(@CurrentUser() user: AdminUser) {
    return this.recordings.storage(user.organizationId);
  }

  @Get('settings')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  settings(@CurrentUser() user: AdminUser) {
    return this.recordings.settings(user.organizationId);
  }

  @Patch('settings')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  updateSettings(
    @CurrentUser() user: AdminUser,
    @Body() dto: UpdateRecordingSettingsDto,
  ) {
    this.assertAdmin(user);
    return this.recordings.updateSettings(user.organizationId, user.userId, dto);
  }

  @Post('start')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  start(@CurrentUser() user: AdminUser, @Body() dto: StartRecordingDto) {
    return this.recordings.start(
      user.organizationId,
      dto.deviceId,
      dto.quality,
    );
  }

  @Post('stop')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  stop(@CurrentUser() user: AdminUser, @Body() dto: StopRecordingDto) {
    return this.recordings.stop(user.organizationId, dto.deviceId);
  }

  @Post('playback-url')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  playbackUrl(
    @CurrentUser() user: AdminUser,
    @Body() body: { id: string; download?: boolean },
  ) {
    return this.recordings.playbackToken(
      user.organizationId,
      user.userId,
      body.id,
      Boolean(body.download),
    );
  }

  @Post('export-url')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  exportUrl(@CurrentUser() user: AdminUser, @Body() dto: ExportRecordingsDto) {
    return this.recordings.exportToken(user.organizationId, user.userId, dto);
  }

  @Get('export/file')
  @ApiOperation({ summary: 'Authenticated ZIP export via playback token' })
  async exportFile(
    @Query('token') token: string,
    @Query('deviceId') deviceId: string | undefined,
    @Query('camera') camera: 'FRONT' | 'BACK' | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new ForbiddenException('Playback token required');
    }
    const payload = await this.recordings.verifyPlaybackToken(token);
    if (payload.typ !== 'recording-export') {
      throw new ForbiddenException('Invalid export token');
    }
    await this.recordings.streamExport(res, payload.organizationId, {
      deviceId: deviceId ?? payload.deviceId ?? undefined,
      camera: camera ?? payload.camera ?? undefined,
      from: from ?? payload.from ?? undefined,
      to: to ?? payload.to ?? undefined,
    });
  }

  @Post('delete-bulk')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  deleteBulk(
    @CurrentUser() user: AdminUser,
    @Body() dto: DeleteRecordingsDto,
  ) {
    this.assertAdmin(user);
    return this.recordings.deleteMany(
      user.organizationId,
      user.userId,
      dto.ids,
    );
  }

  @Post('delete-range')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  deleteRange(@CurrentUser() user: AdminUser, @Body() dto: DeleteRangeDto) {
    this.assertAdmin(user);
    return this.recordings.deleteRange(
      user.organizationId,
      user.userId,
      dto,
    );
  }

  @Get(':id/media')
  @ApiOperation({ summary: 'Stream recording with Range support' })
  async media(
    @Param('id') id: string,
    @Query('token') token: string,
    @Query('download') download: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new ForbiddenException('Playback token required');
    }
    const payload = await this.recordings.verifyPlaybackToken(token);
    if (payload.typ !== 'recording' || payload.recordingId !== id) {
      throw new ForbiddenException('Invalid playback token');
    }
    await this.recordings.streamMedia(
      req,
      res,
      payload.organizationId,
      id,
      download === '1' || payload.download === true,
    );
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  remove(@CurrentUser() user: AdminUser, @Param('id') id: string) {
    this.assertAdmin(user);
    return this.recordings.deleteOne(user.organizationId, user.userId, id);
  }

  private assertAdmin(user: AdminUser) {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin role required');
    }
  }
}
