import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { DeviceAuthGuard } from '../auth/device-auth.guard';
import { CurrentDevice, CurrentUser } from '../auth/decorators';
import { ChatsService } from './chats.service';

class SendMessageDto {
  text!: string;
}

@ApiTags('chats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminRoleGuard)
@Controller('chats')
export class ChatsController {
  constructor(private readonly chats: ChatsService) {}

  @Get()
  list(@CurrentUser() user: { organizationId: string; userId: string }) {
    return this.chats.listForAdmin(user.organizationId, user.userId);
  }

  @Get(':id/messages')
  messages(
    @CurrentUser() user: { organizationId: string; userId: string },
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

  @Post(':id/messages')
  send(
    @CurrentUser() user: { organizationId: string; userId: string },
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chats.sendFromAdmin(
      user.organizationId,
      user.userId,
      id,
      dto.text,
    );
  }
}

@ApiTags('chats')
@Controller('device-chats')
export class DeviceChatsController {
  constructor(private readonly chats: ChatsService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  list(@CurrentDevice() device: { organizationId: string; deviceId: string }) {
    return this.chats.listForDevice(device.organizationId, device.deviceId);
  }

  @Get(':id/messages')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  messages(
    @CurrentDevice() device: { organizationId: string; deviceId: string },
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

  @Post(':id/messages')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  send(
    @CurrentDevice() device: { organizationId: string; deviceId: string },
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chats.sendFromDevice(
      device.organizationId,
      device.deviceId,
      id,
      dto.text ?? '',
    );
  }

  @Post(':id/read')
  @ApiBearerAuth()
  @UseGuards(DeviceAuthGuard)
  read(
    @CurrentDevice() device: { organizationId: string; deviceId: string },
    @Param('id') id: string,
  ) {
    return this.chats.markRead(device.organizationId, device.deviceId, id);
  }
}
