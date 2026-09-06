# WaslShip: Logistics Aggregator Platform (NestJS Modular Monolith)

WaslShip is a high-performance logistics aggregator designed to bridge the gap between merchants and multiple shipping carriers through a single, robust integration with **OTO**. Built with **NestJS**, **TypeScript**, and **TypeORM**.

---

## 🚀 Key Features

### 📦 Shipment Management
- **OTO Gateway Integration**: Unified API for order creation, AWB generation, delivery fee calculation, and real-time tracking.
- **Shipment Lifecycle Management**: Create, update, cancel, hold, unhold, and track shipments.
- **Bulk Order Creation**: Create multiple orders in a single request.
- **Advanced Filtering**: Filter shipments by status, tracking number, merchant, and pagination.
- **Dashboard & Reports**: Real-time operational overview, analytics, and carrier status logs.
- **Webhook Engine**: Automated status synchronization with HMAC/signature verification.

### 💰 Virtual Wallet System & Financial Ledger
- **Transaction-Driven Balance**: The wallet balance is fundamentally derived from and reconciled against the `wallet_transactions` ledger.
- **Zero Phantom Money**: Transactions are only committed upon verified completion (delivered COD, approved bank transfer, approved withdrawal).
- **Ledger-Backed Cache**: Fast $O(1)$ balance reads combined with an immutable double-entry audit trail.
- **Automated Self-Healing**: Real-time ledger reconciliation ensuring `wallet.balance == SUM(transactions)`.
- **Balance Reservations**: Reserve funds upon shipment creation, finalized upon carrier delivery, or released on cancellation.
- **Real-Time Audit Endpoints**: Inspect mathematical proof and categorical breakdowns anytime via API.

### 👤 User & Address Management
- **JWT Authentication & Role-Based Access**: Role guards for `Merchant`, `Admin`, and `SuperAdmin`.
- **OTP Verification & Password Recovery**: Phone verification and secure password hashing with BCrypt.
- **Address Book**: Save and manage pickup and delivery addresses with geocoding.
- **Saudi Locations Directory**: Pre-seeded database of Saudi cities and administrative regions.

### 🔔 Notification Service
- **Multi-Device Support**: Register FCM and web device tokens.
- **Notification Inbox**: Read/unread counters and mark-as-read endpoints.
- **Admin Broadcast**: Send targeted push notifications to user segments.

---

## 🛠️ Tech Stack

- **Framework**: NestJS 10
- **Language**: TypeScript 5
- **ORM**: TypeORM
- **Database**: PostgreSQL 16 (with SQLite development fallback)
- **Containerization**: Docker & Docker Compose
- **API Documentation**: OpenAPI / Swagger (`/docs`)
- **Security**: JWT (`@nestjs/jwt`), Passport, BCrypt, Helmet, CORS, Throttler rate limiting

---

## 🐳 Running with Local Docker Containers

Run the complete stack (**PostgreSQL 16**, **Adminer GUI**, and the **NestJS API**) with a single command:

```bash
# Start all containers in the background
docker-compose up -d

# View container logs
docker-compose logs -f api

# Stop all containers
docker-compose down
```

### Services & URLs in Docker:
- **NestJS API & Swagger**: [http://localhost:3000/docs](http://localhost:3000/docs)
- **Adminer DB GUI**: [http://localhost:8080](http://localhost:8080)
  - **System**: `PostgreSQL`
  - **Server**: `postgres` (or `localhost` if connecting from host machine)
  - **Username**: `postgres`
  - **Password**: `postgres123`
  - **Database**: `waslship_db`
- **PostgreSQL Port**: `5432`

---

## 🚀 Running Locally with Node.js

### 1. Installation
```bash
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env
```
*(Configure `DB_TYPE=postgres` with your local PostgreSQL or leave as `sqlite` for zero-config startup).*

### 3. Start the Server
```bash
# Development
npm run start:dev

# Production Build
npm run build
npm run start:prod
```

### Swagger Documentation
Access the interactive Swagger UI at:
`http://localhost:3000/docs` (or `http://localhost:3000/`)

---
 
##  Financial Ledger Architecture (Ledger-Backed Cache)

WaslShip adheres strictly to enterprise financial and accounting standards. The system guarantees that no money enters or leaves a merchant wallet without an immutable, auditable transaction record.

### 1. The Principle of Completed Transactions
Transactions (`WalletTransaction`) are **never added prematurely** for unconfirmed or pending requests. A ledger entry is written **only upon verified, successful completion**:
- **Cash-On-Delivery (COD)**: Recorded only when courier webhooks or background jobs confirm package delivery and cash collection (`ShipmentStatus.Delivered`). Net credit = Collected COD − Shipping Cost.
- **Bank Transfers**: Recorded only when an admin verifies the funds in the bank account and approves the transfer slip (`BankTransferStatus.Approved`).
- **Withdrawals**: Debited from balance only upon administrative verification and payout processing (`WithdrawalStatus.Approved`).
- **Prepaid Shipments**: Deducted as `ShipmentDeduction` only upon delivery, converting the initial fund reservation into an immutable debit transaction.
- **Online Gateway Top-ups**: Recorded only upon payment gateway confirmation.

### 2. Deriving Balance from the Transaction Ledger
The `wallet_transactions` table serves as the **Authoritative Source of Truth**:
$$\text{Wallet Balance} = \sum_{\text{status} = \text{'Completed'}} \text{transaction.amount}$$

- **Fast Read Cache (`wallets.balance`)**: The stored balance column on the `wallets` table provides $O(1)$ sub-millisecond lookups for shipment label generation and balance checks.
- **Self-Healing & Ledger Synchronization**: Whenever the wallet dashboard or balance audit is requested, `WalletService.syncWalletWithLedger()` re-computes the ledger sum and auto-corrects any discrepancy.
- **Zero Phantom Money**: Every single halala is backed by an auditable transaction with an ID, carrier name, tracking number, or bank deposit reference.

### 3. Ledger Audit Endpoints
- **Merchant Balance Audit**: `GET /api/wallet/balance-audit`
- **Admin Balance Audit**: `GET /api/admin/balance-audit/:merchantId`

Returns real-time mathematical proof, categorical aggregations (`codSettlements`, `bankTransfers`, `deposits`, `withdrawals`, `shipmentDeductions`), and verification status:
```json
{
  "merchantId": "...",
  "currency": "SAR",
  "storedBalance": 1500.0,
  "ledgerCalculatedBalance": 1500.0,
  "discrepancy": 0,
  "isSynchronized": true,
  "reservedBalance": 0,
  "availableBalance": 1500.0,
  "ledgerBreakdown": {
    "codSettlements": { "count": 2, "totalAmount": 420.5 },
    "bankTransfers": { "count": 1, "totalAmount": 1000.0 },
    "deposits": { "count": 1, "totalAmount": 1500.0 },
    "withdrawals": { "count": 0, "totalAmount": 0 },
    "shipmentDeductions": { "count": 1, "totalAmount": -25.0 }
  }
}
```

---

## 🔑 Default Seeded Accounts

- **Super Admin**:
  - Email: `admin@waslship.com`
  - Password: `AdminPass123!`
- **Demo Merchant**:
  - Email: `merchant@waslship.com`
  - Password: `Merchant123!`
  - Starting Balance: `1,500.00 SAR`
