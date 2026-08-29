export enum NotificationType {
  ShipmentCreated = 'ShipmentCreated',
  ShipmentStatusChanged = 'ShipmentStatusChanged',
  WalletCredited = 'WalletCredited',
  WalletDebited = 'WalletDebited',
  BankTransferApproved = 'BankTransferApproved',
  BankTransferRejected = 'BankTransferRejected',
  General = 'General',
}

export enum DevicePlatform {
  iOS = 'iOS',
  Android = 'Android',
  Web = 'Web',
}
