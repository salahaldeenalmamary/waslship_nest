import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shipment } from './entities/shipment.entity';
import { OtoWebhookLog } from './entities/oto-webhook-log.entity';
import { ShipmentAuditLog } from './entities/shipment-audit-log.entity';
import { UserAddress } from '../users/entities/user-address.entity';
import { User } from '../users/entities/user.entity';

// Services
import {
  ShipmentsService,
  ShipmentAuditService,
  ShipmentAddressService,
  ShipmentCarrierService,
  ShipmentAnalyticsService,
  ShipmentTrackingService,
  ShipmentWebhookService,
  ShipmentAdminService,
  ShipmentBatchImporterService,
  OtoClient,
  OtoCarrierAdapter,
  MultiCarrierRegistryService,
} from './services';

// Interceptors
import { ShipmentAuditInterceptor } from './interceptors/shipment-audit.interceptor';

// Controllers
import {
  ShipmentsController,
  ShipmentCarrierController,
  TrackingController,
  AdminShipmentsController,
  AdminCreationController,
  AdminAnalyticsController,
  AdminAuditController,
  OtoWebhookController,
} from './endpoints';

// External Modules
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Shipment,
      OtoWebhookLog,
      ShipmentAuditLog,
      UserAddress,
      User,
    ]),
    forwardRef(() => WalletModule),
    NotificationsModule,
  ],
  controllers: [
    ShipmentCarrierController, // Must be before ShipmentsController to match static /api/shipments/* routes before :id
    ShipmentsController,
    TrackingController,
    AdminShipmentsController,
    AdminCreationController,
    AdminAnalyticsController,
    AdminAuditController,
    OtoWebhookController,
  ],
  providers: [
    ShipmentsService,
    ShipmentAuditService,
    ShipmentAddressService,
    ShipmentCarrierService,
    ShipmentAnalyticsService,
    ShipmentTrackingService,
    ShipmentWebhookService,
    ShipmentAdminService,
    ShipmentBatchImporterService,
    ShipmentAuditInterceptor,
    OtoClient,
    OtoCarrierAdapter,
    MultiCarrierRegistryService,
  ],
  exports: [
    ShipmentsService,
    ShipmentAuditService,
    ShipmentAddressService,
    ShipmentCarrierService,
    ShipmentAnalyticsService,
    ShipmentTrackingService,
    ShipmentWebhookService,
    ShipmentAdminService,
    ShipmentBatchImporterService,
    ShipmentAuditInterceptor,
    OtoClient,
    OtoCarrierAdapter,
    MultiCarrierRegistryService,
    TypeOrmModule,
  ],
})
export class ShipmentsModule {}
