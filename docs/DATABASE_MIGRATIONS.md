# Database Migrations Guide (TypeORM)

WaslShip NestJS API uses **TypeORM 0.3.x Migrations** to manage database schema evolutions reliably across Development, Staging, and Production environments.

---

## 📁 Architecture Overview

```
src/
├── database/
│   ├── data-source.ts              # TypeORM CLI DataSource configuration
│   ├── entities.ts                 # Authoritative export of all domain entities
│   ├── database.module.ts          # NestJS Database Module
│   ├── migrations/                 # Versioned migration files
│   │   └── 1700000000000-InitialMigration.ts
│   ├── services/
│   │   └── migration-runner.service.ts  # Programmatic migration service
│   └── endpoints/
│       └── admin-migrations.controller.ts # Admin REST endpoints for migrations
```

---

## 🚀 Available NPM Migration Scripts

| Command | Description |
| :--- | :--- |
| `npm run migration:show` | Displays all registered migrations and indicates whether each has been executed `[X]` or is pending `[ ]`. |
| `npm run migration:run` | Executes all pending migrations inside a database transaction. |
| `npm run migration:revert` | Reverts (rolls back) the single most recently executed migration. |
| `npm run migration:generate -- src/database/migrations/MigrationName` | Auto-generates a new migration by computing the delta between your TypeORM Entity classes and the current database schema. |
| `npm run migration:create src/database/migrations/MigrationName` | Generates a blank, empty migration boilerplate file ready for custom SQL/TypeORM Table definitions. |

---

## ⚙️ Configuration & Environment Variables

Configure your database connection in your `.env` or production secrets:

```env
# Database Type: 'postgres' (Production/Docker/Cloud SQL) or 'sqlite' (Local dev)
DB_TYPE=postgres

# PostgreSQL Connection parameters
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres123
DB_DATABASE=waslship_db
DB_SSL=false

# Alternatively, specify a single connection string:
DATABASE_URL=postgres://postgres:postgres123@localhost:5432/waslship_db

# Migrations & Schema Synchronization
DB_SYNCHRONIZE=false       # MUST be false in Production to avoid data loss
DB_MIGRATIONS_RUN=true     # Automatically executes pending migrations on app startup
DB_LOGGING=false
```

---

## 🛠️ Step-by-Step Workflow

### 1. Adding or Modifying a Database Entity
When you add a new entity or modify existing entity columns in `src/modules/*/entities/*.entity.ts`:
1. Ensure the entity is exported and registered in `src/database/entities.ts`.
2. Generate the delta migration:
   ```bash
   npm run migration:generate -- src/database/migrations/AddVendorFieldToShipments
   ```
3. Inspect the newly generated file in `src/database/migrations/` to verify the generated schema changes.
4. Execute the migration:
   ```bash
   npm run migration:run
   ```

### 2. Creating a Custom Data/Schema Migration
If you need custom data backfills or complex transformations:
1. Create a blank migration:
   ```bash
   npm run migration:create src/database/migrations/BackfillMerchantCurrencies
   ```
2. Implement the `up` and `down` methods in TypeScript.
3. Test running and reverting:
   ```bash
   npm run migration:run
   npm run migration:revert
   ```

---

## 🔒 Administrative REST Endpoints

The API includes secure administrative endpoints for authorized Admins and SuperAdmins:

- `GET /api/admin/migrations` - View migration history, executed count, pending count, and migration names.
- `POST /api/admin/migrations/run` - Trigger execution of pending migrations programmatically.
- `POST /api/admin/migrations/revert` - Roll back the last executed migration.

---

## 🚢 Production Deployment Checklist

1. Set `DB_SYNCHRONIZE=false` in production.
2. Either enable `DB_MIGRATIONS_RUN=true` to automatically apply migrations on container boot, or run `npm run migration:run` as part of your CI/CD deployment pipeline before traffic cutover.
3. Keep all migrations immutable once applied to production.
