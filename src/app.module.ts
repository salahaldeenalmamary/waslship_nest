import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import * as net from 'net';

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
import { HealthModule } from './modules/health/health.module';
import { DatabaseSeederService } from './common/services/seeder.service';

const logger = new Logger('DatabaseConfig');

async function isDatabasePortOpen(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isSettled = false;

    const finalize = (success: boolean) => {
      if (!isSettled) {
        isSettled = true;
        socket.removeAllListeners();
        socket.destroy();
        resolve(success);
      }
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finalize(true));
    socket.once('timeout', () => finalize(false));
    socket.once('error', () => finalize(false));

    try {
      socket.connect(port, host);
    } catch {
      finalize(false);
    }
  });
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      verboseMemoryLeak: true,
      ignoreErrors: false,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => {
        const dbType = config.get<string>('DB_TYPE', 'sqlite');
        const dbHost = config.get<string>('DB_HOST', 'localhost');
        const dbPort = parseInt(config.get<string>('DB_PORT', '5432'), 10);
        const databaseUrl = config.get<string>('DATABASE_URL');
        const wantsPostgres = dbType === 'postgres' || Boolean(databaseUrl);

        if (wantsPostgres) {
          let hostToCheck = dbHost;
          let portToCheck = dbPort;

          if (databaseUrl) {
            try {
              const parsedUrl = new URL(databaseUrl);
              hostToCheck = parsedUrl.hostname;
              portToCheck = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 5432;
            } catch {
              // fallback to defaults
            }
          }

          const isPostgresLive = await isDatabasePortOpen(hostToCheck, portToCheck, 700);

          if (isPostgresLive) {
            logger.log(` Successfully connected to PostgreSQL instance at ${hostToCheck}:${portToCheck}`);
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
              host: dbHost,
              port: dbPort,
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
          } else {
            logger.warn(
              ` PostgreSQL at ${hostToCheck}:${portToCheck} is not reachable in this container. Using embedded SQLite (waslship.db) so the API and Swagger UI run seamlessly.`,
            );
          }
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
    HealthModule,
  ],
  providers: [DatabaseSeederService],
})
export class AppModule {}
