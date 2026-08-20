import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module';
import { AvatarsModule } from '../avatars/avatars.module';
import { PushModule } from '../push/push.module';
import { ChatGateway } from './chat.gateway';
import { ChatStorageService } from './chat-storage.service';
import { ChatsController, DeviceChatsController } from './chats.controller';
import { ChatsService } from './chats.service';

@Module({
  imports: [JwtModule.register({}), AuditModule, AvatarsModule, PushModule],
  controllers: [ChatsController, DeviceChatsController],
  providers: [ChatsService, ChatGateway, ChatStorageService],
  exports: [ChatsService],
})
export class ChatsModule {}
