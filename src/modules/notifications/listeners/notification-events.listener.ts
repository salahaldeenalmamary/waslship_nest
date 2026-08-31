import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  DomainEventNames,
  ShipmentCreatedEvent,
  ShipmentStatusChangedEvent,
  WalletCreditedEvent,
  BankTransferCreatedEvent,
  BankTransferReviewedEvent,
  WithdrawalRequestedEvent,
  WithdrawalReviewedEvent,
} from '../../../common/events/domain-events';
import { NotificationsService } from '../services/notifications.service';
import { NotificationType } from '../enums/notification.enum';
import { BankTransferStatus, WithdrawalStatus } from '../../wallet/enums/wallet.enum';

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

  @OnEvent(DomainEventNames.WITHDRAWAL_REQUESTED, { async: true })
  async handleWithdrawalRequested(event: WithdrawalRequestedEvent) {
    this.logger.log(
      `Notification handler: Withdrawal requested for merchant ${event.merchantId} (${event.amount} SAR)`,
    );
    await this.notificationsService.sendNotification({
      userId: event.merchantId,
      title: 'Withdrawal Request Submitted',
      body: `Your withdrawal request of ${event.amount.toFixed(2)} SAR has been submitted for admin approval.`,
      type: NotificationType.General,
      data: {
        withdrawalId: event.withdrawalId,
        amount: event.amount,
      },
    });
  }

  @OnEvent(DomainEventNames.WITHDRAWAL_REVIEWED, { async: true })
  async handleWithdrawalReviewed(event: WithdrawalReviewedEvent) {
    this.logger.log(
      `Notification handler: Withdrawal reviewed for merchant ${event.merchantId} (${event.status})`,
    );

    if (event.status === WithdrawalStatus.Approved) {
      await this.notificationsService.sendNotification({
        userId: event.merchantId,
        title: 'Withdrawal Approved & Transferred',
        body: `Your withdrawal request for ${event.amount.toFixed(2)} SAR has been approved.${event.proofImageUrl ? ' Transfer proof image is attached.' : ''}`,
        type: NotificationType.WithdrawalApproved,
        data: {
          withdrawalId: event.withdrawalId,
          amount: event.amount,
          proofImageUrl: event.proofImageUrl,
          adminNotes: event.adminNotes,
        },
      });
    } else if (event.status === WithdrawalStatus.Rejected) {
      await this.notificationsService.sendNotification({
        userId: event.merchantId,
        title: 'Withdrawal Request Rejected',
        body: `Your withdrawal request of ${event.amount.toFixed(2)} SAR was rejected.${event.adminNotes ? ` Reason: ${event.adminNotes}` : ''}`,
        type: NotificationType.WithdrawalRejected,
        data: {
          withdrawalId: event.withdrawalId,
          amount: event.amount,
          adminNotes: event.adminNotes,
        },
      });
    }
  }
}
