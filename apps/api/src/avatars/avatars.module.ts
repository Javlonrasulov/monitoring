import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { AvatarsService } from './avatars.service';

@Module({
  imports: [EventsModule],
  providers: [AvatarsService],
  exports: [AvatarsService],
})
export class AvatarsModule {}
