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

### 💰 Virtual Wallet System
- **Real-time Financial Ledger**: Credit and debit ledger for shipping fees and COD collections.
- **Balance Reservations**: Reserve funds upon shipment creation and deduct upon carrier confirmation.
- **COD Settlements**: Automatic balance credit upon successful Cash-On-Delivery confirmation.
- **Bank Transfers & Top-ups**: Instant deposits and offline bank transfer receipt submissions with Admin approval workflows.

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

## 🔑 Default Seeded Accounts

- **Super Admin**:
  - Email: `admin@waslship.com`
  - Password: `AdminPass123!`
- **Demo Merchant**:
  - Email: `merchant@waslship.com`
  - Password: `Merchant123!`
  - Starting Balance: `1,500.00 SAR`
