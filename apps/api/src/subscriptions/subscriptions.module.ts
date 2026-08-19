import { Module } from '@nestjs/common';
import { SubscriptionsController, DeviceSubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { NowPaymentsService } from './nowpayments.service';

@Module({
  controllers: [SubscriptionsController, DeviceSubscriptionsController],
  providers: [SubscriptionsService, NowPaymentsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
