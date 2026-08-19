import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StreamingController } from './streaming.controller';
import { StreamingService } from './streaming.service';
import { AuditModule } from '../audit/audit.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [AuthModule, AuditModule, SubscriptionsModule],
  controllers: [StreamingController],
  providers: [StreamingService],
  exports: [StreamingService],
})
export class StreamingModule {}
