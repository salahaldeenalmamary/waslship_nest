# Financial Reconciliation Workflow

The reconciliation workflow ensures that the virtual credit held by merchants in WaslShip is accurately debited and credited based on physical shipment events and OTO financial reporting.

## 1. Webhook: `walletTransaction`
This is the primary source of truth for OTO-reported financial events.

### Payload Analysis:
- `amount`: Negative for charges (shipping fees), positive for refunds or settlements.
- `orderId`: Corresponds to WaslShip's `TrackingNumber`.
- `transactionType`: Distinguishes between `dcFee` (Shipping charge), `creditPurchase`, or `refund`.
- `chargeType`: `charge`, `refund`, `partialRefund`, etc.

## 2. Reconciliation Logic

### Step A: Identification & Verification
1.  **Verify Signature**: Use the shared secret to ensure the transaction report is authentic.
2.  **Locate Shipment**: Find the `Shipment` record using the `orderId`.
3.  **Identify Merchant**: Extract `MerchantId` from the shipment record.

### Step B: State Transition
- **Case: Shipment Confirmed**:
    - WaslShip publishes `ShipmentConfirmedEvent`.
    - `WalletService` deducts the `ShippingCost` immediately (Prepaid logic).
- **Case: OTO Charge (Webhook)**:
    - If OTO reports a `dcFee`, WaslShip compares it with the estimated `ShippingCost`.
    - If there is a discrepancy (e.g., weight update), an `AdditionalCharge` transaction is logged.
- **Case: COD Settlement**:
    - OTO sends a `walletTransaction` with a positive `amount`.
    - WaslShip credits the merchant's wallet and publishes a `CODSettledEvent`.

## 3. Data Logging & History
Every financial movement creates a `WalletTransaction` record:
- `TransactionId`: Unique internal GUID.
- `MerchantId`: Owner of the funds.
- `ReferenceId`: The `TrackingNumber` or OTO `id`.
- `Amount`: The monetary value.
- `Type`: (Debit/Credit).
- `Description`: Human-readable reason (e.g., "Shipping Fee for WS123").

## 4. Reconciliation Reports
A periodic background task compares:
`Sum(WalletTransactions) where ReferenceId = WS123`
vs.
`Shipment.ShippingCost + Shipment.CodAmount`
Any mismatches are flagged in an `AuditTrail` for administrative review.
