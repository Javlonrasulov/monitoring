import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StreamingController } from './streaming.controller';
import { StreamingService } from './streaming.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [StreamingController],
  providers: [StreamingService],
  exports: [StreamingService],
})
export class StreamingModule {}
