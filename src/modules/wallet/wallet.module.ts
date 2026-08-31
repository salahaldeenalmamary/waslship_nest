import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { WalletTransaction } from './entities/transaction.entity';
import { BankTransferPayment } from './entities/bank-transfer-payment.entity';
import { BankAccount } from './entities/bank-account.entity';
import { WalletService } from './services/wallet.service';
import { BankAccountService } from './services/bank-account.service';
import { BankTransferPaymentService } from './services/bank-transfer-payment.service';
import { WalletController } from './endpoints/wallet.controller';
import { AdminWalletController } from './endpoints/admin-wallet.controller';
import {
  BankAccountController,
  AdminBankAccountController,
} from './endpoints/bank-account.controller';
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
  providers: [
    WalletService,
    BankAccountService,
    BankTransferPaymentService,
    WalletEventsListener,
  ],
  exports: [WalletService, BankAccountService, BankTransferPaymentService, TypeOrmModule],
})
export class WalletModule {}
