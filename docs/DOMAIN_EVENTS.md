# WaslShip Domain Event Bus Architecture & Complete Code Reference

This document outlines the architectural changes, implementation details, and **complete source code** for the **NestJS Event Bus** (`@nestjs/event-emitter`) implementation as a replacement for .NET MediatR / Domain Events.

---

## 🏗️ 1. Architecture Overview

In .NET, domain events and decoupled background processing are commonly built using `MediatR` (`INotification` / `INotificationHandler<T>`) or `MassTransit`. In this NestJS modular monolith, we use `@nestjs/event-emitter` to decouple modules:

```
┌─────────────────────────┐
│     ShipmentsModule     │
│ (Creates / Updates AWB) │
└────────────┬────────────┘
             │  emits DomainEvent
             ▼
┌────────────────────────────────────────────────────────┐
│             EventEmitter2 Global Event Bus             │
└────────────┬─────────────────────────────┬─────────────┘
             │                             │
             ▼                             ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│  WalletEventsListener   │   │NotificationEventsListener│
│ - Settles COD Funds     │   │ - Dispatches FCM Push   │
│ - Releases Reservations │   │ - Writes User Inbox Log │
└─────────────────────────┘   └─────────────────────────┘
```

---

## 📦 2. Installation & Module Registration

### A. NPM Package Installation
```bash
npm install @nestjs/event-emitter
```

### B. Global Registration in `src/app.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ShipmentsModule } from './modules/shipments/shipments.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    // 🚀 Register Global Event Bus
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      verboseMemoryLeak: true,
      ignoreErrors: false,
    }),
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'waslship.db',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true,
    }),
    AuthModule,
    UsersModule,
    ShipmentsModule,
    WalletModule,
    NotificationsModule,
  ],
})
export class AppModule {}
```

---

## 📜 3. Domain Event Definitions (`src/common/events/domain-events.ts`)

```typescript
import { PaymentMethod, ShipmentStatus } from '../../modules/shipments/enums/shipment.enum';
import { BankTransferStatus, TransactionType } from '../../modules/wallet/enums/wallet.enum';

export enum DomainEventNames {
  SHIPMENT_CREATED = 'shipment.created',
  SHIPMENT_STATUS_CHANGED = 'shipment.status_changed',
  SHIPMENT_DELIVERED = 'shipment.delivered',
  SHIPMENT_CANCELLED = 'shipment.cancelled',

  WALLET_CREDITED = 'wallet.credited',
  WALLET_DEBITED = 'wallet.debited',
  WALLET_RESERVATION_CREATED = 'wallet.reservation_created',
  WALLET_RESERVATION_RELEASED = 'wallet.reservation_released',
  BANK_TRANSFER_CREATED = 'wallet.bank_transfer_created',
  BANK_TRANSFER_REVIEWED = 'wallet.bank_transfer_reviewed',
}

/**
 * Dispatched when a new shipment is created and registered with carrier/OTO.
 */
export class ShipmentCreatedEvent {
  constructor(
    public readonly shipmentId: string,
    public readonly merchantId: string,
    public readonly trackingNumber: string,
    public readonly shippingCost: number,
    public readonly paymentMethod: PaymentMethod,
    public readonly codAmount: number,
    public readonly carrierName?: string,
    public readonly recipientName?: string,
    public readonly recipientCity?: string,
  ) {}
}

/**
 * Dispatched when a shipment transitions between lifecycle statuses.
 */
export class ShipmentStatusChangedEvent {
  constructor(
    public readonly shipmentId: string,
    public readonly merchantId: string,
    public readonly trackingNumber: string,
    public readonly oldStatus: ShipmentStatus,
    public readonly newStatus: ShipmentStatus,
    public readonly paymentMethod: PaymentMethod,
    public readonly codAmount: number,
    public readonly shippingCost: number,
    public readonly notes?: string,
    public readonly carrierName?: string,
  ) {}
}

/**
 * Dispatched when funds are credited to a merchant's virtual wallet.
 */
export class WalletCreditedEvent {
  constructor(
    public readonly merchantId: string,
    public readonly walletId: string,
    public readonly amount: number,
    public readonly transactionType: TransactionType,
    public readonly referenceId?: string,
    public readonly description?: string,
  ) {}
}

/**
 * Dispatched when funds are debited or reserved from a merchant's virtual wallet.
 */
export class WalletDebitedEvent {
  constructor(
    public readonly merchantId: string,
    public readonly walletId: string,
    public readonly amount: number,
    public readonly reason: string,
    public readonly referenceId?: string,
  ) {}
}

/**
 * Dispatched when a merchant submits a new offline bank transfer payment receipt.
 */
export class BankTransferCreatedEvent {
  constructor(
    public readonly transferId: string,
    public readonly merchantId: string,
    public readonly amount: number,
    public readonly bankName: string,
    public readonly accountNumber: string,
    public readonly receiptUrl?: string,
  ) {}
}

/**
 * Dispatched when an administrator approves or rejects a bank transfer.
 */
export class BankTransferReviewedEvent {
  constructor(
    public readonly transferId: string,
    public readonly merchantId: string,
    public readonly amount: number,
    public readonly status: BankTransferStatus,
    public readonly adminNotes?: string,
    public readonly reviewedByAdminId?: string,
  ) {}
}
```

---

## 🎧 4. Event Listeners (Consumers)

### A. Wallet Domain Listener (`src/modules/wallet/listeners/wallet-events.listener.ts`)

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  DomainEventNames,
  ShipmentStatusChangedEvent,
} from '../../../common/events/domain-events';
import { ShipmentStatus, PaymentMethod } from '../../shipments/enums/shipment.enum';
import { WalletService } from '../wallet.service';

@Injectable()
export class WalletEventsListener {
  private readonly logger = new Logger(WalletEventsListener.name);

  constructor(private readonly walletService: WalletService) {}

  @OnEvent(DomainEventNames.SHIPMENT_STATUS_CHANGED, { async: true })
  async handleShipmentStatusChanged(event: ShipmentStatusChangedEvent) {
    this.logger.log(
      `Received ${DomainEventNames.SHIPMENT_STATUS_CHANGED} for shipment #${event.trackingNumber}: ${event.oldStatus} -> ${event.newStatus}`,
    );

    try {
      // 1. Process COD settlement upon delivery
      if (
        event.newStatus === ShipmentStatus.Delivered &&
        event.oldStatus !== ShipmentStatus.Delivered &&
        event.paymentMethod === PaymentMethod.COD &&
        event.codAmount > 0
      ) {
        this.logger.log(
          `Processing COD settlement for shipment #${event.trackingNumber}, COD: ${event.codAmount} SAR`,
        );
        await this.walletService.processCodSettlement(
          event.merchantId,
          event.shipmentId,
          event.codAmount,
          event.shippingCost,
        );
      }

      // 2. Release reservation if shipment was cancelled
      if (
        event.newStatus === ShipmentStatus.Cancelled &&
        event.oldStatus !== ShipmentStatus.Cancelled
      ) {
        this.logger.log(
          `Releasing reservation for cancelled shipment #${event.trackingNumber}`,
        );
        await this.walletService.releaseShipmentReservation(
          event.merchantId,
          event.shippingCost,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to process wallet update for event ${DomainEventNames.SHIPMENT_STATUS_CHANGED}: ${err.message}`,
        err.stack,
      );
    }
  }
}
```

---

### B. Notification Domain Listener (`src/modules/notifications/listeners/notification-events.listener.ts`)

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  DomainEventNames,
  ShipmentCreatedEvent,
  ShipmentStatusChangedEvent,
  WalletCreditedEvent,
  BankTransferCreatedEvent,
  BankTransferReviewedEvent,
} from '../../../common/events/domain-events';
import { NotificationsService } from '../notifications.service';
import { NotificationType } from '../enums/notification.enum';
import { BankTransferStatus } from '../../wallet/enums/wallet.enum';

@Injectable()
export class NotificationEventsListener {
  private readonly logger = new Logger(NotificationEventsListener.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @OnEvent(DomainEventNames.SHIPMENT_CREATED, { async: true })
  async handleShipmentCreated(event: ShipmentCreatedEvent) {
    this.logger.log(`Notification handler: Shipment #${event.trackingNumber} created`);
    await this.notificationsService.sendNotification({
      userId: event.merchantId,
      title: 'Shipment Created',
      body: `Shipment #${event.trackingNumber} to ${event.recipientName || 'customer'} (${event.recipientCity || ''}) has been booked.`,
      type: NotificationType.ShipmentCreated,
      data: {
        shipmentId: event.shipmentId,
        trackingNumber: event.trackingNumber,
        carrierName: event.carrierName,
      },
    });
  }

  @OnEvent(DomainEventNames.SHIPMENT_STATUS_CHANGED, { async: true })
  async handleShipmentStatusChanged(event: ShipmentStatusChangedEvent) {
    this.logger.log(
      `Notification handler: Shipment #${event.trackingNumber} status changed to ${event.newStatus}`,
    );
    await this.notificationsService.sendNotification({
      userId: event.merchantId,
      title: `Shipment ${event.newStatus}`,
      body: `Shipment #${event.trackingNumber} status changed to ${event.newStatus}.${event.notes ? ` Notes: ${event.notes}` : ''}`,
      type: NotificationType.ShipmentStatusChanged,
      data: {
        shipmentId: event.shipmentId,
        trackingNumber: event.trackingNumber,
        status: event.newStatus,
      },
    });
  }

  @OnEvent(DomainEventNames.WALLET_CREDITED, { async: true })
  async handleWalletCredited(event: WalletCreditedEvent) {
    this.logger.log(
      `Notification handler: Wallet credited for merchant ${event.merchantId} (+${event.amount} SAR)`,
    );
    await this.notificationsService.sendNotification({
      userId: event.merchantId,
      title: 'Wallet Balance Credited',
      body: `${event.amount.toFixed(2)} SAR has been credited to your wallet. ${event.description || ''}`,
      type: NotificationType.WalletCredited,
      data: {
        amount: event.amount,
        type: event.transactionType,
        referenceId: event.referenceId,
      },
    });
  }

  @OnEvent(DomainEventNames.BANK_TRANSFER_CREATED, { async: true })
  async handleBankTransferCreated(event: BankTransferCreatedEvent) {
    this.logger.log(
      `Notification handler: Bank transfer submitted for merchant ${event.merchantId} (${event.amount} SAR)`,
    );
    await this.notificationsService.sendNotification({
      userId: event.merchantId,
      title: 'Bank Transfer Received',
      body: `Your bank transfer proof for ${event.amount.toFixed(2)} SAR has been submitted for review.`,
      type: NotificationType.General,
      data: {
        transferId: event.transferId,
        amount: event.amount,
      },
    });
  }

  @OnEvent(DomainEventNames.BANK_TRANSFER_REVIEWED, { async: true })
  async handleBankTransferReviewed(event: BankTransferReviewedEvent) {
    this.logger.log(
      `Notification handler: Bank transfer reviewed for merchant ${event.merchantId} (${event.status})`,
    );

    if (event.status === BankTransferStatus.Approved) {
      await this.notificationsService.sendNotification({
        userId: event.merchantId,
        title: 'Bank Transfer Approved',
        body: `Your bank transfer of ${event.amount.toFixed(2)} SAR has been approved and added to your balance.`,
        type: NotificationType.BankTransferApproved,
        data: {
          transferId: event.transferId,
          amount: event.amount,
        },
      });
    } else if (event.status === BankTransferStatus.Rejected) {
      await this.notificationsService.sendNotification({
        userId: event.merchantId,
        title: 'Bank Transfer Rejected',
        body: `Your bank transfer of ${event.amount.toFixed(2)} SAR was rejected.${event.adminNotes ? ` Reason: ${event.adminNotes}` : ''}`,
        type: NotificationType.BankTransferRejected,
        data: {
          transferId: event.transferId,
          amount: event.amount,
        },
      });
    }
  }
}
```

---

## 🔌 5. Module Providers Configuration

### `src/modules/notifications/notifications.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationEntity } from './entities/notification.entity';
import { DeviceToken } from './entities/device-token.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationEventsListener } from './listeners/notification-events.listener';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationEntity, DeviceToken])],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationEventsListener],
  exports: [NotificationsService, TypeOrmModule],
})
export class NotificationsModule {}
```

### `src/modules/wallet/wallet.module.ts`
```typescript
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { WalletTransaction } from './entities/transaction.entity';
import { BankTransferPayment } from './entities/bank-transfer-payment.entity';
import { WalletService } from './wallet.service';
import { WalletController, AdminWalletController } from './wallet.controller';
import { WalletEventsListener } from './listeners/wallet-events.listener';
import { NotificationsModule } from '../notifications/notifications.module';
import { ShipmentsModule } from '../shipments/shipments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, WalletTransaction, BankTransferPayment]),
    NotificationsModule,
    forwardRef(() => ShipmentsModule),
  ],
  controllers: [WalletController, AdminWalletController],
  providers: [WalletService, WalletEventsListener],
  exports: [WalletService, TypeOrmModule],
})
export class WalletModule {}
```

---

## 🚀 6. Event Publishing in Services

### Emitting from `src/modules/shipments/shipments.service.ts`

```typescript
// Constructor injection
constructor(
  @InjectRepository(Shipment)
  private readonly shipmentRepository: Repository<Shipment>,
  private readonly eventEmitter: EventEmitter2,
) {}

// On Shipment Created:
this.eventEmitter.emit(
  DomainEventNames.SHIPMENT_CREATED,
  new ShipmentCreatedEvent(
    saved.id,
    merchantId,
    saved.trackingNumber,
    saved.shippingCost,
    saved.paymentMethod,
    saved.codAmount,
    saved.carrierName,
    saved.recipientName,
    saved.recipientCity,
  ),
);

// On Shipment Status Changed:
this.eventEmitter.emit(
  DomainEventNames.SHIPMENT_STATUS_CHANGED,
  new ShipmentStatusChangedEvent(
    updated.id,
    updated.merchantId,
    updated.trackingNumber,
    oldStatus,
    updated.status,
    updated.paymentMethod,
    updated.codAmount,
    updated.shippingCost,
    dto.notes,
    updated.carrierName,
  ),
);
```

### Emitting from `src/modules/wallet/wallet.service.ts`

```typescript
// On Wallet Balance Credit:
this.eventEmitter.emit(
  DomainEventNames.WALLET_CREDITED,
  new WalletCreditedEvent(
    merchantId,
    wallet.id,
    netCredit,
    TransactionType.CODSettlement,
    shipmentId,
    description,
  ),
);

// On Bank Transfer Receipt Submitted:
this.eventEmitter.emit(
  DomainEventNames.BANK_TRANSFER_CREATED,
  new BankTransferCreatedEvent(
    saved.id,
    merchantId,
    saved.amount,
    saved.bankName,
    saved.accountNumber,
    saved.receiptUrl,
  ),
);

// On Bank Transfer Admin Decision:
this.eventEmitter.emit(
  DomainEventNames.BANK_TRANSFER_REVIEWED,
  new BankTransferReviewedEvent(
    transfer.id,
    transfer.merchantId,
    transfer.amount,
    dto.status,
    dto.adminNotes,
    adminId,
  ),
);
```

---

## ⚡ 7. Direct .NET (MediatR) to NestJS Equivalents

| .NET Concept (C# / MediatR) | NestJS Equivalent |
| :--- | :--- |
| `public record ShipmentCreatedEvent(...) : INotification;` | `export class ShipmentCreatedEvent { constructor(...) {} }` |
| `await _mediator.Publish(new ShipmentCreatedEvent(...));` | `this.eventEmitter.emit(DomainEventNames.SHIPMENT_CREATED, new ShipmentCreatedEvent(...));` |
| `public class WalletHandler : INotificationHandler<ShipmentCreatedEvent>` | `@Injectable() export class WalletEventsListener { @OnEvent('shipment.created', { async: true }) async handle(...) {} }` |
| `services.AddMediatR(...)` | `EventEmitterModule.forRoot({...})` in `AppModule` imports |
| Scoped Dependency in Handler | Standard NestJS Dependency Injection into Listener class |
