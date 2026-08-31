export enum NotificationType {
  ShipmentCreated = 'ShipmentCreated',
  ShipmentStatusChanged = 'ShipmentStatusChanged',
  WalletCredited = 'WalletCredited',
  WalletDebited = 'WalletDebited',
  BankTransferApproved = 'BankTransferApproved',
  BankTransferRejected = 'BankTransferRejected',
  WithdrawalApproved = 'WithdrawalApproved',
  WithdrawalRejected = 'WithdrawalRejected',
  General = 'General',
}

export enum DevicePlatform {
  iOS = 'iOS',
  Android = 'Android',
  Web = 'Web',
}
