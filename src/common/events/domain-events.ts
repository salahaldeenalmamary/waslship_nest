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
