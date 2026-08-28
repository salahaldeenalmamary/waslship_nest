# 2. Virtual Wallet & Financial Reconciliation

Since OTO manages the physical balance at the platform level, WaslShip implements a **Virtual Wallet** for each merchant to track their specific funds, shipping costs, and COD collections.

## Transaction Lifecycle

### 1. Shipment Confirmation (Deduction)
When a shipment is confirmed and an AWB is generated, the shipping fee is deducted from the merchant's virtual wallet.
- **Trigger**: `ShipmentConfirmedEvent`
- **Action**: `Debit` Merchant Wallet.

### 2. COD Settlement (Credit)
For Cash on Delivery orders, OTO collects the funds from the courier and settles them. WaslShip listens for these settlements to credit the merchant.
- **Trigger**: `walletTransaction` Webhook (Type: `refund` or `additionalCharge` depending on OTO flow) or `ShipmentDeliveredEvent`.
- **Action**: `Credit` Merchant Wallet with `CodAmount`.

### 3. Cancellation & Refunds
If an order is cancelled before pickup, the reserved shipping fee is automatically returned to the virtual wallet.
- **Trigger**: `ShipmentCancelledEvent`.
- **Action**: `Credit` (Refund) Merchant Wallet.

## Wallet Transaction Webhook (JSON Payload)
Used for real-time financial reconciliation.
```json
{
  "amount": -25.00,
  "orderId": "WS20260720123456",
  "transactionStatus": "completed",
  "chargeType": "charge",
  "transactionType": "dcFee",
  "remainingAmount": 1500.50,
  "deliveryCompanyName": "Aramex",
  "timestamp": 1767011253000,
  "signature": "..."
}
```

## Reconciliation Flow
1. **Webhook Ingest**: Receive `walletTransaction` from OTO.
2. **Signature Verify**: Ensure the payload is authentic.
3. **Reference Lookup**: Match `orderId` to WaslShip's local `Shipment`.
4. **State Sync**: Update internal ledger to match OTO's reported transaction.
