import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class InitialMigration1700000000000 implements MigrationInterface {
  name = 'InitialMigration1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. users
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'isDeleted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'email',
            type: 'varchar',
            isUnique: true,
          },
          {
            name: 'phoneNumber',
            type: 'varchar',
            isUnique: true,
          },
          {
            name: 'passwordHash',
            type: 'varchar',
          },
          {
            name: 'fullName',
            type: 'varchar',
          },
          {
            name: 'avatarUrl',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'companyName',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'role',
            type: 'varchar',
            default: "'Merchant'",
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'isPhoneVerified',
            type: 'boolean',
            default: false,
          },
          {
            name: 'otpCode',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'otpExpiryTime',
            type: 'datetime',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // 2. user_addresses
    await queryRunner.createTable(
      new Table({
        name: 'user_addresses',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'isDeleted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'userId',
            type: 'varchar',
          },
          {
            name: 'title',
            type: 'varchar',
          },
          {
            name: 'type',
            type: 'varchar',
            default: "'Both'",
          },
          {
            name: 'contactName',
            type: 'varchar',
          },
          {
            name: 'contactPhone',
            type: 'varchar',
          },
          {
            name: 'country',
            type: 'varchar',
          },
          {
            name: 'city',
            type: 'varchar',
          },
          {
            name: 'district',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'street',
            type: 'varchar',
          },
          {
            name: 'buildingNumber',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'postalCode',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'latitude',
            type: 'float',
            isNullable: true,
          },
          {
            name: 'longitude',
            type: 'float',
            isNullable: true,
          },
          {
            name: 'isDefault',
            type: 'boolean',
            default: false,
          },
          {
            name: 'otoBranchCode',
            type: 'varchar',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // 3. user_bank_accounts
    await queryRunner.createTable(
      new Table({
        name: 'user_bank_accounts',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'isDeleted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'userId',
            type: 'varchar',
          },
          {
            name: 'bankName',
            type: 'varchar',
          },
          {
            name: 'accountHolderName',
            type: 'varchar',
          },
          {
            name: 'accountNumber',
            type: 'varchar',
          },
          {
            name: 'iban',
            type: 'varchar',
          },
          {
            name: 'swiftCode',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'isDefault',
            type: 'boolean',
            default: false,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
        ],
      }),
      true,
    );

    // 4. locations
    await queryRunner.createTable(
      new Table({
        name: 'locations',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'isDeleted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'nameEn',
            type: 'varchar',
          },
          {
            name: 'nameAr',
            type: 'varchar',
          },
          {
            name: 'code',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'parentCode',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'type',
            type: 'varchar',
            default: "'City'",
          },
        ],
      }),
      true,
    );

    // 5. bank_accounts
    await queryRunner.createTable(
      new Table({
        name: 'bank_accounts',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'isDeleted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'bankName',
            type: 'varchar',
          },
          {
            name: 'accountHolderName',
            type: 'varchar',
          },
          {
            name: 'accountNumber',
            type: 'varchar',
          },
          {
            name: 'iban',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
        ],
      }),
      true,
    );

    // 6. wallets
    await queryRunner.createTable(
      new Table({
        name: 'wallets',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'isDeleted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'merchantId',
            type: 'varchar',
            isUnique: true,
          },
          {
            name: 'balance',
            type: 'float',
            default: 0,
          },
          {
            name: 'reservedBalance',
            type: 'float',
            default: 0,
          },
          {
            name: 'pendingCodBalance',
            type: 'float',
            default: 0,
          },
          {
            name: 'currency',
            type: 'varchar',
            default: "'SAR'",
          },
        ],
      }),
      true,
    );

    // 7. wallet_transactions
    await queryRunner.createTable(
      new Table({
        name: 'wallet_transactions',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'isDeleted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'walletId',
            type: 'varchar',
          },
          {
            name: 'merchantId',
            type: 'varchar',
          },
          {
            name: 'amount',
            type: 'float',
          },
          {
            name: 'type',
            type: 'varchar',
          },
          {
            name: 'status',
            type: 'varchar',
            default: "'Completed'",
          },
          {
            name: 'referenceId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'description',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'currency',
            type: 'varchar',
            default: "'SAR'",
          },
        ],
      }),
      true,
    );

    // 8. bank_transfer_payments
    await queryRunner.createTable(
      new Table({
        name: 'bank_transfer_payments',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'isDeleted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'merchantId',
            type: 'varchar',
          },
          {
            name: 'amount',
            type: 'float',
          },
          {
            name: 'bankAccountId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'receiptUrl',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            default: "'Pending'",
          },
          {
            name: 'adminNotes',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'reviewedByAdminId',
            type: 'varchar',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // 9. withdrawal_requests
    await queryRunner.createTable(
      new Table({
        name: 'withdrawal_requests',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'isDeleted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'merchantId',
            type: 'varchar',
          },
          {
            name: 'amount',
            type: 'float',
          },
          {
            name: 'userBankAccountId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            default: "'Pending'",
          },
          {
            name: 'proofImageUrl',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'adminNotes',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'reviewedByAdminId',
            type: 'varchar',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // 10. shipments
    await queryRunner.createTable(
      new Table({
        name: 'shipments',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'isDeleted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'merchantId',
            type: 'varchar',
          },
          {
            name: 'trackingNumber',
            type: 'varchar',
            isUnique: true,
          },
          {
            name: 'otoOrderId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'otoDeliveryFee',
            type: 'float',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            default: "'CREATED'",
          },
          {
            name: 'paymentMethod',
            type: 'varchar',
            default: "'COD'",
          },
          {
            name: 'codAmount',
            type: 'float',
            default: 0,
          },
          {
            name: 'shippingCost',
            type: 'float',
            default: 0,
          },
          {
            name: 'currency',
            type: 'varchar',
            default: "'SAR'",
          },
          {
            name: 'pickupAddressId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'deliveryAddressId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'weightKg',
            type: 'float',
            default: 1,
          },
          {
            name: 'piecesCount',
            type: 'integer',
            default: 1,
          },
          {
            name: 'packageDescription',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'carrierName',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'carrierTrackingUrl',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'notes',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'isCodSettled',
            type: 'boolean',
            default: false,
          },
          {
            name: 'deliveredAt',
            type: 'datetime',
            isNullable: true,
          },
          {
            name: 'createdByAdminId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'createdByAdminName',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'lastModifiedByAdminId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'lastModifiedByAdminName',
            type: 'varchar',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // 11. shipment_audit_logs
    await queryRunner.createTable(
      new Table({
        name: 'shipment_audit_logs',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'shipmentId',
            type: 'varchar',
          },
          {
            name: 'trackingNumber',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'action',
            type: 'varchar',
          },
          {
            name: 'fromStatus',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'toStatus',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'adminId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'adminName',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'adminEmail',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'adminRole',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'source',
            type: 'varchar',
            default: "'ADMIN'",
          },
          {
            name: 'ipAddress',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'userAgent',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'text',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // 12. oto_webhook_logs
    await queryRunner.createTable(
      new Table({
        name: 'oto_webhook_logs',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'isDeleted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'eventType',
            type: 'varchar',
          },
          {
            name: 'otoOrderId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'trackingNumber',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'payload',
            type: 'text',
          },
          {
            name: 'isProcessed',
            type: 'boolean',
            default: true,
          },
          {
            name: 'errorMessage',
            type: 'varchar',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // 13. notifications
    await queryRunner.createTable(
      new Table({
        name: 'notifications',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'isDeleted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'userId',
            type: 'varchar',
          },
          {
            name: 'title',
            type: 'varchar',
          },
          {
            name: 'body',
            type: 'varchar',
          },
          {
            name: 'type',
            type: 'varchar',
            default: "'General'",
          },
          {
            name: 'data',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'isRead',
            type: 'boolean',
            default: false,
          },
          {
            name: 'readAt',
            type: 'datetime',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // 14. device_tokens
    await queryRunner.createTable(
      new Table({
        name: 'device_tokens',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'isDeleted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'userId',
            type: 'varchar',
          },
          {
            name: 'token',
            type: 'varchar',
            isUnique: true,
          },
          {
            name: 'platform',
            type: 'varchar',
            default: "'Web'",
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
        ],
      }),
      true,
    );

    // 15. media_attachments
    await queryRunner.createTable(
      new Table({
        name: 'media_attachments',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'isDeleted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'entityType',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'entityId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'tag',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'fileName',
            type: 'varchar',
          },
          {
            name: 'originalName',
            type: 'varchar',
          },
          {
            name: 'mimeType',
            type: 'varchar',
          },
          {
            name: 'size',
            type: 'integer',
          },
          {
            name: 'url',
            type: 'varchar',
          },
          {
            name: 'filePath',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'uploadedById',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'text',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Indexes for fast lookup
    await queryRunner.createIndex(
      'shipment_audit_logs',
      new TableIndex({
        name: 'IDX_shipment_audit_logs_shipmentId',
        columnNames: ['shipmentId'],
      }),
    );
    await queryRunner.createIndex(
      'shipment_audit_logs',
      new TableIndex({
        name: 'IDX_shipment_audit_logs_trackingNumber',
        columnNames: ['trackingNumber'],
      }),
    );
    await queryRunner.createIndex(
      'shipment_audit_logs',
      new TableIndex({
        name: 'IDX_shipment_audit_logs_adminId',
        columnNames: ['adminId'],
      }),
    );
    await queryRunner.createIndex(
      'media_attachments',
      new TableIndex({
        name: 'IDX_media_attachments_entity',
        columnNames: ['entityType', 'entityId'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('media_attachments', true);
    await queryRunner.dropTable('device_tokens', true);
    await queryRunner.dropTable('notifications', true);
    await queryRunner.dropTable('oto_webhook_logs', true);
    await queryRunner.dropTable('shipment_audit_logs', true);
    await queryRunner.dropTable('shipments', true);
    await queryRunner.dropTable('withdrawal_requests', true);
    await queryRunner.dropTable('bank_transfer_payments', true);
    await queryRunner.dropTable('wallet_transactions', true);
    await queryRunner.dropTable('wallets', true);
    await queryRunner.dropTable('bank_accounts', true);
    await queryRunner.dropTable('locations', true);
    await queryRunner.dropTable('user_bank_accounts', true);
    await queryRunner.dropTable('user_addresses', true);
    await queryRunner.dropTable('users', true);
  }
}
