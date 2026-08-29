import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shipment } from './entities/shipment.entity';
import { OtoWebhookLog } from './entities/oto-webhook-log.entity';
import { ShipmentsService } from './shipments.service';
import {
  ShipmentsController,
  TrackingController,
  AdminShipmentsController,
} from './shipments.controller';
import { OtoClient } from './services/oto.client';
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Shipment, OtoWebhookLog]),
    forwardRef(() => WalletModule),
    NotificationsModule,
  ],
  controllers: [
    ShipmentsController,
    TrackingController,
    AdminShipmentsController,
  ],
  providers: [ShipmentsService, OtoClient],
  exports: [ShipmentsService, OtoClient, TypeOrmModule],
})
export class ShipmentsModule {}
