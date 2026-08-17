import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DevicesService } from './devices.service';

@Injectable()
export class DevicePresenceService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private readonly devicesService: DevicesService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.devicesService.markStaleDevicesOffline();
    }, 15_000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}
