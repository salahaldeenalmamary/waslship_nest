import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shipment } from './entities/shipment.entity';
import { OtoWebhookLog } from './entities/oto-webhook-log.entity';
import { ShipmentAuditLog } from './entities/shipment-audit-log.entity';
import { UserAddress } from '../users/entities/user-address.entity';
import { User } from '../users/entities/user.entity';
import { ShipmentsService } from './services/shipments.service';
import { ShipmentAuditService } from './services/shipment-audit.service';
import { ShipmentAuditInterceptor } from './interceptors/shipment-audit.interceptor';
import { ShipmentsController } from './endpoints/shipments.controller';
import { TrackingController } from './endpoints/tracking.controller';
import { AdminShipmentsController } from './endpoints/admin-shipments.controller';
import { OtoClient } from './services/oto.client';
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
    ShipmentsController,
    TrackingController,
    AdminShipmentsController,
  ],
  providers: [
    ShipmentsService,
    ShipmentAuditService,
    ShipmentAuditInterceptor,
    OtoClient,
  ],
  exports: [
    ShipmentsService,
    ShipmentAuditService,
    ShipmentAuditInterceptor,
    OtoClient,
    TypeOrmModule,
  ],
})
export class ShipmentsModule {}
