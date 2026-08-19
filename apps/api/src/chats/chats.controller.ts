import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { DeviceAuthGuard } from '../auth/device-auth.guard';
import { CurrentDevice, CurrentUser } from '../auth/decorators';
import { ChatsService } from './chats.service';
import { AvatarsService } from '../avatars/avatars.service';
import {
  EditMessageDto,
  InitUploadDto,
  ReactMessageDto,
  SendMessageDto,
} from './chats.dto';

type AdminUser = {
  organizationId: string;
  userId: string;
  role: string;
};

type DeviceUser = {
  organizationId: string;
  deviceId: string;
};

@ApiTags('chats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminRoleGuard)
@Controller('chats')
export class ChatsController {
  constructor(
    private readonly chats: ChatsService,
    private readonly avatars: AvatarsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AdminUser) {
    return this.chats.listForAdmin(user.organizationId, user.userId);
  }

  @Get('avatars/:userId')
  avatar(
    @CurrentUser() user: AdminUser,
    @Param('userId') userId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.avatars.streamForOrg(
      req,
      res,
      user.organizationId,
      userId,
    );
  }

  @Get(':id/search')
  search(
    @CurrentUser() user: AdminUser,
    @Param('id') id: string,
    @Query('q') q?: string,
  ) {
    return this.chats.searchMessages(
      user.organizationId,
      user.userId,
      id,
      q ?? '',
      undefined,
      true,
    );
  }

  @Get(':id/media')
  media(
    @CurrentUser() user: AdminUser,
    @Param('id') id: string,
    @Query('kind') kind?: string,
  ) {
    return this.chats.mediaForThread(
      user.organizationId,
      user.userId,
      id,
      kind ?? 'media',
      undefined,
      true,
    );
  }

  @Get(':id/files/:messageId/thumb')
  thumb(
    @CurrentUser() user: AdminUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.chats.streamAttachment(
      req,
      res,
      user.organizationId,
      id,
      messageId,
      'thumb',
      false,
      undefined,
      true,
    );
  }

  @Get(':id/files/:messageId')
  file(
    @CurrentUser() user: AdminUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Query('download') download: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.chats.streamAttachment(
      req,
      res,
      user.organizationId,
      id,
      messageId,
      'file',
      download === '1' || download === 'true',
      undefined,
      true,
    );
  }

  @Get(':id/messages')
  messages(
    @CurrentUser() user: AdminUser,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    return this.chats.messagesForAdmin(
      user.organizationId,
      user.userId,
      id,
      cursor,
      take ? Number(take) : 40,
    );
  }

  @Get(':id')
  thread(@CurrentUser() user: AdminUser, @Param('id') id: string) {
    return this.chats.threadForAdmin(user.organizationId, user.userId, id);
  }

  @Post(':id/uploads/:uploadId/complete')
  completeUpload(
    @CurrentUser() user: AdminUser,
    @Param('id') id: string,
    @Param('uploadId') uploadId: string,
  ) {
    return this.chats.completeUpload(
      user.organizationId,
      user.userId,
      uploadId,
      id,
    );
  }

  @Put(':id/uploads/:uploadId/chunks/:index')
  putChunk(
    @CurrentUser() user: AdminUser,
    @Param('id') id: string,
    @Param('uploadId') uploadId: string,
    @Param('index') index: string,
    @Req() req: Request,
  ) {
    return this.chats.putChunk(
      user.organizationId,
      uploadId,
      Number(index),
      req,
      id,
      user.userId,
    );
  }

  @Delete(':id/uploads/:uploadId')
  cancelUpload(
    @CurrentUser() user: AdminUser,
    @Param('id') id: string,
    @Param('uploadId') uploadId: string,
  ) {
    return this.chats.cancelUpload(
      user.organizationId,
      uploadId,
      id,
      user.userId,
    );
  }

  @Post(':id/uploads')
  initUpload(
    @CurrentUser() user: AdminUser,
    @Param('id') id: string,
    @Body() dto: InitUploadDto,
  ) {
    return this.chats.initUploadFromAdmin(
      user.organizationId,
      user.userId,
      user.role,
      id,
      dto,
    );
  }

  @Post(':id/messages/:messageId/thumbnail')
  thumbnail(
    @CurrentUser() user: AdminUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Req() req: Request,
  ) {
    return this.chats.saveThumbnail(
      user.organizationId,
      id,
      messageId,
      req,
      user.userId,
    );
  }

  @Post(':id/messages/:messageId/react')
  react(
    @CurrentUser() user: AdminUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() dto: ReactMessageDto,
  ) {
    return this.chats.react(
      user.organizationId,
      user.userId,
      id,
      messageId,
      dto.emoji,
    );
  }

  @Patch(':id/messages/:messageId')
  edit(
    @CurrentUser() user: AdminUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.chats.editMessage(
      user.organizationId,
      user.userId,
      id,
      messageId,
      dto.text,
    );
  }

  @Delete(':id/messages/:messageId')
  remove(
    @CurrentUser() user: AdminUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Query('forEveryone') forEveryone?: string,
  ) {
    return this.chats.deleteMessage(
      user.organizationId,
      user.userId,
      id,
      messageId,
      forEveryone === '1' || forEveryone === 'true',
    );
  }

  @Post(':id/messages')
  send(@CurrentUser() user: AdminUser, @Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.chats.sendFromAdmin(
      user.organizationId,
      user.userId,
      user.role,
      id,
      dto.text ?? '',
      {
        replyToId: dto.replyToId,
        clientId: dto.clientId,
        forwardedFromId: dto.forwardedFromId,
      },
    );
  }

  @Post(':id/read')
  read(@CurrentUser() user: AdminUser, @Param('id') id: string) {
    return this.chats.markRead(
      user.organizationId,
      user.userId,
      id,
      undefined,
      user.role,
    );
  }
}

@ApiTags('chats')
@Controller('device-chats')
export class DeviceChatsController {
  constructor(
    private readonly chats: ChatsService,
    private readonly avatars: AvatarsService,
  ) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  list(@CurrentDevice() device: DeviceUser) {
    return this.chats.listForDevice(device.organizationId, device.deviceId);
  }

  @Get('avatars/:userId')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  avatar(
    @CurrentDevice() device: DeviceUser,
    @Param('userId') userId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.avatars.streamForOrg(
      req,
      res,
      device.organizationId,
      userId,
    );
  }

  @Get(':id/search')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  async search(
    @CurrentDevice() device: DeviceUser,
    @Param('id') id: string,
    @Query('q') q?: string,
  ) {
    const thread = await this.chats.threadForDevice(
      device.organizationId,
      device.deviceId,
      id,
    );
    return this.chats.searchMessages(
      device.organizationId,
      thread.viewerUserId,
      id,
      q ?? '',
      device.deviceId,
      false,
    );
  }

  @Get(':id/media')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  async media(
    @CurrentDevice() device: DeviceUser,
    @Param('id') id: string,
    @Query('kind') kind?: string,
  ) {
    const thread = await this.chats.threadForDevice(
      device.organizationId,
      device.deviceId,
      id,
    );
    return this.chats.mediaForThread(
      device.organizationId,
      thread.viewerUserId,
      id,
      kind ?? 'media',
      device.deviceId,
      false,
    );
  }

  @Get(':id/files/:messageId/thumb')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  thumb(
    @CurrentDevice() device: DeviceUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.chats.streamAttachment(
      req,
      res,
      device.organizationId,
      id,
      messageId,
      'thumb',
      false,
      device.deviceId,
    );
  }

  @Get(':id/files/:messageId')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  file(
    @CurrentDevice() device: DeviceUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Query('download') download: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.chats.streamAttachment(
      req,
      res,
      device.organizationId,
      id,
      messageId,
      'file',
      download === '1' || download === 'true',
      device.deviceId,
    );
  }

  @Get(':id/messages')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  messages(
    @CurrentDevice() device: DeviceUser,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    return this.chats.messagesForDevice(
      device.organizationId,
      device.deviceId,
      id,
      cursor,
      take ? Number(take) : 40,
    );
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  thread(@CurrentDevice() device: DeviceUser, @Param('id') id: string) {
    return this.chats.threadForDevice(device.organizationId, device.deviceId, id);
  }

  @Post(':id/uploads/:uploadId/complete')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  async completeUpload(
    @CurrentDevice() device: DeviceUser,
    @Param('id') id: string,
    @Param('uploadId') uploadId: string,
  ) {
    const thread = await this.chats.threadForDevice(
      device.organizationId,
      device.deviceId,
      id,
    );
    return this.chats.completeUpload(
      device.organizationId,
      thread.viewerUserId,
      uploadId,
      id,
    );
  }

  @Put(':id/uploads/:uploadId/chunks/:index')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  async putChunk(
    @CurrentDevice() device: DeviceUser,
    @Param('id') id: string,
    @Param('uploadId') uploadId: string,
    @Param('index') index: string,
    @Req() req: Request,
  ) {
    const thread = await this.chats.threadForDevice(
      device.organizationId,
      device.deviceId,
      id,
    );
    return this.chats.putChunk(
      device.organizationId,
      uploadId,
      Number(index),
      req,
      id,
      thread.viewerUserId,
    );
  }

  @Delete(':id/uploads/:uploadId')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  async cancelUpload(
    @CurrentDevice() device: DeviceUser,
    @Param('id') id: string,
    @Param('uploadId') uploadId: string,
  ) {
    const thread = await this.chats.threadForDevice(
      device.organizationId,
      device.deviceId,
      id,
    );
    return this.chats.cancelUpload(
      device.organizationId,
      uploadId,
      id,
      thread.viewerUserId,
    );
  }

  @Post(':id/uploads')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  initUpload(
    @CurrentDevice() device: DeviceUser,
    @Param('id') id: string,
    @Body() dto: InitUploadDto,
  ) {
    return this.chats.initUploadFromDevice(
      device.organizationId,
      device.deviceId,
      id,
      dto,
    );
  }

  @Post(':id/messages/:messageId/thumbnail')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  async thumbnail(
    @CurrentDevice() device: DeviceUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Req() req: Request,
  ) {
    const thread = await this.chats.threadForDevice(
      device.organizationId,
      device.deviceId,
      id,
    );
    return this.chats.saveThumbnail(
      device.organizationId,
      id,
      messageId,
      req,
      thread.viewerUserId,
      device.deviceId,
    );
  }

  @Post(':id/messages/:messageId/react')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  async react(
    @CurrentDevice() device: DeviceUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() dto: ReactMessageDto,
  ) {
    const thread = await this.chats.threadForDevice(
      device.organizationId,
      device.deviceId,
      id,
    );
    return this.chats.react(
      device.organizationId,
      thread.viewerUserId,
      id,
      messageId,
      dto.emoji,
      device.deviceId,
    );
  }

  @Patch(':id/messages/:messageId')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  async edit(
    @CurrentDevice() device: DeviceUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() dto: EditMessageDto,
  ) {
    const thread = await this.chats.threadForDevice(
      device.organizationId,
      device.deviceId,
      id,
    );
    return this.chats.editMessage(
      device.organizationId,
      thread.viewerUserId,
      id,
      messageId,
      dto.text,
      device.deviceId,
    );
  }

  @Delete(':id/messages/:messageId')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  async remove(
    @CurrentDevice() device: DeviceUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Query('forEveryone') forEveryone?: string,
  ) {
    const thread = await this.chats.threadForDevice(
      device.organizationId,
      device.deviceId,
      id,
    );
    return this.chats.deleteMessage(
      device.organizationId,
      thread.viewerUserId,
      id,
      messageId,
      forEveryone === '1' || forEveryone === 'true',
      device.deviceId,
    );
  }

  @Post(':id/messages')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  send(
    @CurrentDevice() device: DeviceUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chats.sendFromDevice(
      device.organizationId,
      device.deviceId,
      id,
      dto.text ?? '',
      {
        replyToId: dto.replyToId,
        clientId: dto.clientId,
        forwardedFromId: dto.forwardedFromId,
      },
    );
  }

  @Post(':id/read')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  read(@CurrentDevice() device: DeviceUser, @Param('id') id: string) {
    return this.chats.markReadDevice(
      device.organizationId,
      device.deviceId,
      id,
    );
  }
}
