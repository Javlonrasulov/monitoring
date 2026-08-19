import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module';
import { ChatGateway } from './chat.gateway';
import { ChatsController, DeviceChatsController } from './chats.controller';
import { ChatsService } from './chats.service';

@Module({
  imports: [JwtModule.register({}), AuditModule],
  controllers: [ChatsController, DeviceChatsController],
  providers: [ChatsService, ChatGateway],
  exports: [ChatsService],
})
export class ChatsModule {}
