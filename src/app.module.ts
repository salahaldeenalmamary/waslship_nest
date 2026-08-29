import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { User } from './modules/users/entities/user.entity';
import { UserAddress } from './modules/users/entities/user-address.entity';
import { Location } from './modules/users/entities/location.entity';
import { Shipment } from './modules/shipments/entities/shipment.entity';
import { OtoWebhookLog } from './modules/shipments/entities/oto-webhook-log.entity';
import { Wallet } from './modules/wallet/entities/wallet.entity';
import { WalletTransaction } from './modules/wallet/entities/transaction.entity';
import { BankTransferPayment } from './modules/wallet/entities/bank-transfer-payment.entity';
import { NotificationEntity } from './modules/notifications/entities/notification.entity';
import { DeviceToken } from './modules/notifications/entities/device-token.entity';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ShipmentsModule } from './modules/shipments/shipments.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DatabaseSeederService } from './common/services/seeder.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const dbType = config.get<string>('DB_TYPE', 'sqlite');
        const isPostgres = dbType === 'postgres' || Boolean(config.get<string>('DB_HOST')) || Boolean(config.get<string>('DATABASE_URL'));

        if (isPostgres) {
          const databaseUrl = config.get<string>('DATABASE_URL');
          if (databaseUrl) {
            return {
              type: 'postgres',
              url: databaseUrl,
              entities: [
                User,
                UserAddress,
                Location,
                Shipment,
                OtoWebhookLog,
                Wallet,
                WalletTransaction,
                BankTransferPayment,
                NotificationEntity,
                DeviceToken,
              ],
              synchronize: config.get<string>('DB_SYNCHRONIZE', 'true') === 'true',
              logging: config.get<string>('DB_LOGGING', 'false') === 'true',
              ssl: config.get<string>('DB_SSL', 'false') === 'true' ? { rejectUnauthorized: false } : false,
            };
          }

          return {
            type: 'postgres',
            host: config.get<string>('DB_HOST', 'localhost'),
            port: parseInt(config.get<string>('DB_PORT', '5432'), 10),
            username: config.get<string>('DB_USERNAME', 'postgres'),
            password: config.get<string>('DB_PASSWORD', 'postgres123'),
            database: config.get<string>('DB_DATABASE', 'waslship_db'),
            entities: [
              User,
              UserAddress,
              Location,
              Shipment,
              OtoWebhookLog,
              Wallet,
              WalletTransaction,
              BankTransferPayment,
              NotificationEntity,
              DeviceToken,
            ],
            synchronize: config.get<string>('DB_SYNCHRONIZE', 'true') === 'true',
            logging: config.get<string>('DB_LOGGING', 'false') === 'true',
            ssl: config.get<string>('DB_SSL', 'false') === 'true' ? { rejectUnauthorized: false } : false,
          };
        }

        return {
          type: 'sqlite',
          database: config.get<string>('DB_DATABASE', 'waslship.db'),
          entities: [
            User,
            UserAddress,
            Location,
            Shipment,
            OtoWebhookLog,
            Wallet,
            WalletTransaction,
            BankTransferPayment,
            NotificationEntity,
            DeviceToken,
          ],
          synchronize: true,
          logging: false,
        };
      },
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([User, Location, Wallet]),
    AuthModule,
    UsersModule,
    ShipmentsModule,
    WalletModule,
    NotificationsModule,
  ],
  providers: [DatabaseSeederService],
})
export class AppModule {}
