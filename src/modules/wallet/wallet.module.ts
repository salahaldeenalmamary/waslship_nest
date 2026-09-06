import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { WalletTransaction } from './entities/transaction.entity';
import { BankTransferPayment } from './entities/bank-transfer-payment.entity';
import { BankAccount } from './entities/bank-account.entity';
import { WithdrawalRequest } from './entities/withdrawal-request.entity';
import { CodReceiptReconciliation } from './entities/cod-receipt-reconciliation.entity';
import { UserBankAccount } from '../users/entities/user-bank-account.entity';
import { Shipment } from '../shipments/entities/shipment.entity';
import { User } from '../users/entities/user.entity';
import { WalletService } from './services/wallet.service';
import { BankAccountService } from './services/bank-account.service';
import { BankTransferPaymentService } from './services/bank-transfer-payment.service';
import { WithdrawalRequestService } from './services/withdrawal-request.service';
import { CodSettlementService } from './services/cod-settlement.service';
import { FinancialStatementService } from './services/financial-statement.service';
import { AutomatedCodSettlementPipelineService } from './services/automated-cod-settlement-pipeline.service';
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
      WithdrawalRequest,
      CodReceiptReconciliation,
      UserBankAccount,
      Shipment,
      User,
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
    WithdrawalRequestService,
    CodSettlementService,
    FinancialStatementService,
    AutomatedCodSettlementPipelineService,
    WalletEventsListener,
  ],
  exports: [
    WalletService,
    BankAccountService,
    BankTransferPaymentService,
    WithdrawalRequestService,
    CodSettlementService,
    FinancialStatementService,
    AutomatedCodSettlementPipelineService,
    TypeOrmModule,
  ],
})
export class WalletModule {}
