import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { WalletTransaction } from './entities/transaction.entity';
import { BankTransferPayment } from './entities/bank-transfer-payment.entity';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { AdminWalletController } from './admin-wallet.controller';
import { WalletEventsListener } from './listeners/wallet-events.listener';
import { NotificationsModule } from '../notifications/notifications.module';
import { ShipmentsModule } from '../shipments/shipments.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      WalletTransaction,
      BankTransferPayment,
    ]),
    NotificationsModule,
    forwardRef(() => ShipmentsModule),
    StorageModule,
  ],
  controllers: [WalletController, AdminWalletController],
  providers: [WalletService, WalletEventsListener],
  exports: [WalletService, TypeOrmModule],
})
export class WalletModule {}
