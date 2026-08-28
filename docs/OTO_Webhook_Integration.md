# OTO Webhook Integration & Architecture Analysis

This document provides a deep technical analysis and implementation guide for OTO Webhook integration within the WaslShip platform. It covers payload specifications, security protocols, and the architectural logic for multitenancy and financial reconciliation.

---

## 1. Executive Summary: The WaslShip Platform Model

WaslShip operates a **Shared OTO Account Model**. Unlike traditional integrations where each merchant has an OTO account, WaslShip acts as the master platform. 

### Key Pillars:
- **Multitenancy**: Data isolation is achieved by using WaslShip's internal `TrackingNumber` as the OTO `orderId`. Updates are routed to the correct merchant via internal database lookups.
- **Virtual Wallet**: WaslShip maintains an internal ledger for each merchant. Physical credit is managed by WaslShip on OTO, while virtual credit is debited/credited locally based on webhook events.
- **Real-time Sync**: A robust webhook listener ensures WaslShip's shipment states and financial balances are always in sync with OTO's logistics gateway.

---

## 2. Webhook Specifications

OTO pushes updates to WaslShip via four primary webhook types.

### A. Order Status (`orderStatus`)
**Purpose**: Tracks the physical movement of the parcel from "Processing" to "Delivered".
- **Payload Structure**:
```json
{
  "orderId": "WS20260720123456",
  "otoId": "17234521",
  "status": "delivered",
  "dcStatus": "Out for delivery",
  "trackingNumber": "TRK987654321",
  "deliveryCompany": "Aramex",
  "printAWBURL": "https://app.tryoto.com/OTOAWB?enc=...",
  "driverName": "Ahmed Ali",
  "driverPhone": "966555444333",
  "timestamp": "1595941360328",
  "signature": "..."
}
```

### B. Shipment Error (`shipmentError`)
**Purpose**: Captures upstream failures from delivery companies (e.g., invalid city, out of coverage).
- **Payload Structure**:
```json
{
    "orderId": "WS20260720999999",
    "errorMessage": "City/Zipcode is empty",
    "errorCode": "deliveryCompanyError",
    "deliveryCompany": "aramex",
    "timestamp": "1653642441399",
    "signature": "..."
}
```

### C. New Orders (`newOrders`)
**Purpose**: Synchronizes orders created directly in OTO or via marketplace integrations (WMS Flow).
- **Payload Structure**:
```json
{
    "order": {
        "otoId": 14796940,
        "incrementId": "OID-23331",
        "status": "assignedToWarehouse",
        "grandTotal": 150.00,
        "currency": "SAR",
        "address": { "city": "Dubai", "mobile": "96651..." },
        "items": [ { "sku": "10143", "qtyOrdered": 1 } ]
    },
    "timestamp": 1742822768001,
    "signature": "..."
}
```

### D. Wallet Transaction (`walletTransaction`)
**Purpose**: Real-time financial reconciliation for charges, refunds, and COD settlements.
- **Payload Structure**:
```json
{
  "amount": -29.00,
  "orderId": "WS20260720123456",
  "transactionStatus": "completed",
  "chargeType": "charge",
  "transactionType": "dcFee",
  "remainingAmount": 2820.00,
  "timestamp": 1767011253000,
  "signature": "..."
}
```

---

## 3. Security: HMAC SHA256 Signature Verification

To ensure data integrity and authenticity, OTO signs every payload. WaslShip validates this signature before processing any logic.

### Verification Algorithm:
1.  **Format**: `orderId:status:timestamp` (Note: for Wallet, use `transactionStatus`).
2.  **Hashing**: `HMAC-SHA256` using the shared `SecretKey` provided during registration.
3.  **Encoding**: The resulting hash is **Base64** encoded.

### C# Implementation Example:
```csharp
var message = $"{orderId}:{status}:{timestamp}";
using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secretKey));
var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(message));
var isValid = Convert.ToBase64String(hash) == receivedSignature;
```

---

## 4. Webhook Management API

WaslShip provides endpoints to manage OTO webhook registrations programmatically.

### Register a Webhook
- **Method**: `POST`
- **Endpoint**: `/api/v1/admin/webhooks`
- **Request Body**:
```json
{
    "method": "POST",
    "url": "https://api.waslship.com/api/v1/webhooks/oto/order-status",
    "webhookType": "orderStatus",
    "secretKey": "secure_key_123",
    "orderPrefix": "fulfill"
}
```

### List Registered Webhooks
- **Method**: `GET`
- **Endpoint**: `/api/v1/admin/webhooks`

### Update Webhook Configuration
- **Method**: `PUT`
- **Endpoint**: `/api/v1/admin/webhooks`
- **Request Body**: Include the `id` of the webhook to modify.

### Delete a Webhook
- **Method**: `DELETE`
- **Endpoint**: `/api/v1/admin/webhooks/{id}`

---

## 5. Architectural Deep Dive

### I. Data Isolation
Every `Shipment` in WaslShip stores the `MerchantId`. When a webhook arrives with an `orderId`, WaslShip queries:
`SELECT * FROM Shipments WHERE TrackingNumber = @orderId`.
This ensures that even though the OTO account is shared, the update is only applied to the specific merchant's shipment record.

### II. Financial Reconciliation
- **Shipping Fees**: Debited from the merchant's virtual wallet when the `orderStatus` moves to `Processing` or `Confirmed`.
- **COD Collections**: Credited to the merchant's wallet when `walletTransaction` type `refund` (settlement) is received or status reaches `Delivered`.
- **Cancellations**: Automatically triggers a `Credit` transaction if a fee was previously debited.

### III. Lifecycle Synchronization
WaslShip maintains an event-driven internal state machine. Status updates from OTO trigger internal `IntegrationEvents` (e.g., `ShipmentDeliveredEvent`), which other services (like Notification or Wallet) consume to perform downstream actions.
