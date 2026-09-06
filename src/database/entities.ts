import { User } from '../modules/users/entities/user.entity';
import { UserAddress } from '../modules/users/entities/user-address.entity';
import { UserBankAccount } from '../modules/users/entities/user-bank-account.entity';
import { Location } from '../modules/users/entities/location.entity';
import { Shipment } from '../modules/shipments/entities/shipment.entity';
import { OtoWebhookLog } from '../modules/shipments/entities/oto-webhook-log.entity';
import { ShipmentAuditLog } from '../modules/shipments/entities/shipment-audit-log.entity';
import { Wallet } from '../modules/wallet/entities/wallet.entity';
import { WalletTransaction } from '../modules/wallet/entities/transaction.entity';
import { BankTransferPayment } from '../modules/wallet/entities/bank-transfer-payment.entity';
import { BankAccount } from '../modules/wallet/entities/bank-account.entity';
import { WithdrawalRequest } from '../modules/wallet/entities/withdrawal-request.entity';
import { NotificationEntity } from '../modules/notifications/entities/notification.entity';
import { DeviceToken } from '../modules/notifications/entities/device-token.entity';
import { MediaAttachment } from '../modules/storage/entities/media-attachment.entity';

export const ALL_ENTITIES = [
  User,
  UserAddress,
  UserBankAccount,
  Location,
  Shipment,
  OtoWebhookLog,
  ShipmentAuditLog,
  Wallet,
  WalletTransaction,
  BankTransferPayment,
  BankAccount,
  WithdrawalRequest,
  NotificationEntity,
  DeviceToken,
  MediaAttachment,
];

export {
  User,
  UserAddress,
  UserBankAccount,
  Location,
  Shipment,
  OtoWebhookLog,
  ShipmentAuditLog,
  Wallet,
  WalletTransaction,
  BankTransferPayment,
  BankAccount,
  WithdrawalRequest,
  NotificationEntity,
  DeviceToken,
  MediaAttachment,
};
