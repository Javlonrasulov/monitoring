import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { DevicesModule } from './devices/devices.module';
import { StreamingModule } from './streaming/streaming.module';
import { SnapshotsModule } from './snapshots/snapshots.module';
import { AuditModule } from './audit/audit.module';
import { EventsModule } from './events/events.module';
import { RecordingsModule } from './recordings/recordings.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
    DevicesModule,
    StreamingModule,
    SnapshotsModule,
    AuditModule,
    EventsModule,
    RecordingsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
