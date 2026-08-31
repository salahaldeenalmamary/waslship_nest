import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { WalletTransaction } from './entities/transaction.entity';
import { BankTransferPayment } from './entities/bank-transfer-payment.entity';
import { BankAccount } from './entities/bank-account.entity';
import { WalletService } from './wallet.service';
import { BankAccountService } from './bank-account.service';
import { WalletController } from './wallet.controller';
import { AdminWalletController } from './admin-wallet.controller';
import {
  BankAccountController,
  AdminBankAccountController,
} from './bank-account.controller';
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
      BankAccount,
    ]),
    NotificationsModule,
    forwardRef(() => ShipmentsModule),
    StorageModule,
  ],
  controllers: [
    WalletController,
    AdminWalletController,
    BankAccountController,
    AdminBankAccountController,
  ],
  providers: [WalletService, BankAccountService, WalletEventsListener],
  exports: [WalletService, BankAccountService, TypeOrmModule],
})
export class WalletModule {}
