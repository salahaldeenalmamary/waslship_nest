# OTO Lifecycle Synchronization Deep Dive

This document details how WaslShip maintains a real-time state mirror with OTO.

## 1. Webhook Architecture
WaslShip uses a multi-endpoint webhook strategy to ensure high performance and clear separation of concerns.

### Registered Endpoints:
- `/api/v1/webhooks/oto/order-status`: High-frequency tracking updates.
- `/api/v1/webhooks/oto/shipment-error`: Critical courier-level failure notifications.
- `/api/v1/webhooks/oto/new-orders`: Marketplace/WMS synchronization.
- `/api/v1/webhooks/oto/wallet-transaction`: Financial reconciliation.

## 2. Status Mapping Logic
The system translates OTO's granular statuses into a simplified internal `ShipmentStatus` enum.

| OTO Status String | Internal Status | Business Logic Action |
| :--- | :--- | :--- |
| `new`, `pending` | `Pending` | Waiting for validation. |
| `confirmed`, `processing` | `Confirmed` | AWB generated; balance reserved. |
| `picked_up` | `PickedUp` | Parcel in custody of courier. |
| `in_transit` | `InTransit` | Long-haul movement. |
| `delivered` | `Delivered` | Final status; COD settlement triggered. |
| `cancelled` | `Cancelled` | Fee refund triggered. |
| `failed` | `Failed` | Alert merchant; retry logic available. |

## 3. Integration Events
When a status change is detected via webhook, WaslShip publishes **Integration Events** to the internal message bus:
1.  **ShipmentConfirmedEvent**: Triggers shipping fee deduction.
2.  **ShipmentDeliveredEvent**: Triggers settlement process and analytics update.
3.  **ShipmentCancelledEvent**: Triggers fee refund and inventory release.

## 4. Reliability & Retries
- **Idempotency**: All webhook handlers check the current status before processing. If a webhook is received twice, the second is ignored.
- **Timestamp Ordering**: The `timestamp` field in the payload is used to ensure old updates do not overwrite newer ones in case of delayed delivery.
