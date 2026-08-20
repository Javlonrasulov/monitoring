import { Module } from '@nestjs/common';
import {
  DevicePushTokensController,
  PushTokensController,
} from './push.controller';
import { PushService } from './push.service';

@Module({
  controllers: [PushTokensController, DevicePushTokensController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
