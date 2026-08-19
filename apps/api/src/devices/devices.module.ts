import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { EventsModule } from '../events/events.module';
import { AuditModule } from '../audit/audit.module';
import { DevicePresenceService } from './device-presence.service';
import { RecordingsModule } from '../recordings/recordings.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ChatsModule } from '../chats/chats.module';

@Module({
    imports: [AuthModule, EventsModule, AuditModule, RecordingsModule, SubscriptionsModule, ChatsModule],
  controllers: [DevicesController],
  providers: [DevicesService, DevicePresenceService],
  exports: [DevicesService],
})
export class DevicesModule {}
