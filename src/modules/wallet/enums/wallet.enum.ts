export enum TransactionType {
  Deposit = 'Deposit',
  ShipmentDeduction = 'ShipmentDeduction',
  ShipmentRefund = 'ShipmentRefund',
  CODSettlement = 'CODSettlement',
  BankTransfer = 'BankTransfer',
  Withdrawal = 'Withdrawal',
  Adjustment = 'Adjustment',
}

export enum TransactionStatus {
  Pending = 'Pending',
  Completed = 'Completed',
  Failed = 'Failed',
  Cancelled = 'Cancelled',
}

export enum BankTransferStatus {
  Pending = 'Pending',
  Processing = 'Processing',
  Approved = 'Approved',
  Rejected = 'Rejected',
}

export enum WithdrawalStatus {
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected',
}

export enum CodReconciliationStatus {
  Completed = 'Completed',
  CompletedWithDiscrepancies = 'CompletedWithDiscrepancies',
  Failed = 'Failed',
}
