import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { EventsModule } from '../events/events.module';
import { AuditModule } from '../audit/audit.module';
import { DevicePresenceService } from './device-presence.service';

@Module({
  imports: [AuthModule, EventsModule, AuditModule],
  controllers: [DevicesController],
  providers: [DevicesService, DevicePresenceService],
  exports: [DevicesService],
})
export class DevicesModule {}
