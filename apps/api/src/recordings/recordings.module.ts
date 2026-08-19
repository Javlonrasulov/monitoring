import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StreamingModule } from '../streaming/streaming.module';
import { EventsModule } from '../events/events.module';
import { AuditModule } from '../audit/audit.module';
import { RecordingsController } from './recordings.controller';
import { RecordingsService } from './recordings.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [AuthModule, StreamingModule, EventsModule, AuditModule, SubscriptionsModule],
  controllers: [RecordingsController],
  providers: [RecordingsService],
  exports: [RecordingsService],
})
export class RecordingsModule {}
