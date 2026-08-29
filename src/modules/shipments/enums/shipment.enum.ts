export enum ShipmentStatus {
  Draft = 'Draft',
  Created = 'Created',
  ReadyForPickup = 'ReadyForPickup',
  PickedUp = 'PickedUp',
  InTransit = 'InTransit',
  OutForDelivery = 'OutForDelivery',
  Delivered = 'Delivered',
  Cancelled = 'Cancelled',
  Returned = 'Returned',
  Failed = 'Failed',
  OnHold = 'OnHold',
}

export enum PaymentMethod {
  COD = 'COD',
  Prepaid = 'Prepaid',
  Wallet = 'Wallet',
}
