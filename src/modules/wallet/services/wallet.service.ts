import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Wallet } from '../entities/wallet.entity';
import { WalletTransaction } from '../entities/transaction.entity';
import {
  TransactionStatus,
  TransactionType,
} from '../enums/wallet.enum';
import {
  InitiateDepositDto,
} from '../dtos/wallet.dto';
import { PaginationParamsDto, PagedResult } from '../../../common/dtos/pagination.dto';
import { NotificationsService } from '../../notifications/services/notifications.service';
import {
  DomainEventNames,
  WalletCreditedEvent,
} from '../../../common/events/domain-events';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getOrCreateWallet(merchantId: string): Promise<Wallet> {
    let wallet = await this.walletRepository.findOne({
      where: { merchantId, isDeleted: false },
    });

    if (!wallet) {
      wallet = this.walletRepository.create({
        merchantId,
        balance: 0,
        reservedBalance: 0,
        pendingCodBalance: 0,
        currency: 'SAR',
      });
      wallet = await this.walletRepository.save(wallet);
    }
    return wallet;
  }

  /**
   * Calculates the exact wallet balance directly from the authoritative transaction ledger.
   * Only successfully completed transactions are factored into the balance:
   * Ledger Balance = SUM(Completed Transactions: Credits (+) and Debits (-))
   */
  async calculateBalanceFromLedger(merchantId: string): Promise<number> {
    const raw = await this.transactionRepository
      .createQueryBuilder('tx')
      .select('COALESCE(SUM(tx.amount), 0)', 'total')
      .where('tx.merchantId = :merchantId', { merchantId })
      .andWhere('tx.status = :status', { status: TransactionStatus.Completed })
      .andWhere('tx.isDeleted = :isDeleted', { isDeleted: false })
      .getRawOne();

    const sum = Number(Number(raw?.total || 0).toFixed(2));

    // Handle initialization edge case: if no transactions exist but wallet has initial seeded balance
    const txCount = await this.transactionRepository.count({
      where: { merchantId, isDeleted: false },
    });

    if (txCount === 0) {
      const wallet = await this.getOrCreateWallet(merchantId);
      if (Number(wallet.balance) > 0) {
        // Backfill initial opening balance ledger entry
        const initTx = this.transactionRepository.create({
          walletId: wallet.id,
          merchantId,
          amount: Number(wallet.balance),
          type: TransactionType.Deposit,
          status: TransactionStatus.Completed,
          description: 'Initial Wallet Opening Provision',
          currency: wallet.currency || 'SAR',
        });
        await this.transactionRepository.save(initTx);
        return Number(wallet.balance);
      }
    }

    return sum;
  }

  /**
   * Reconciles the fast-cache `wallets.balance` with the authoritative `wallet_transactions` ledger.
   * If any drift or discrepancy is detected, it auto-corrects the cached balance to ensure mathematical consistency.
   */
  async syncWalletWithLedger(merchantId: string): Promise<{
    wallet: Wallet;
    ledgerBalance: number;
    discrepancy: number;
    wasReconciled: boolean;
  }> {
    const wallet = await this.getOrCreateWallet(merchantId);
    const ledgerBalance = await this.calculateBalanceFromLedger(merchantId);
    const currentCached = Number(wallet.balance);
    const discrepancy = Number((currentCached - ledgerBalance).toFixed(2));

    let wasReconciled = false;
    if (discrepancy !== 0) {
      this.logger.warn(
        `[Ledger Sync] Discrepancy detected for merchant ${merchantId}: Stored=${currentCached} SAR, Ledger=${ledgerBalance} SAR. Syncing to ledger...`,
      );
      wallet.balance = ledgerBalance;
      await this.walletRepository.save(wallet);
      wasReconciled = true;
    }

    return { wallet, ledgerBalance, discrepancy, wasReconciled };
  }

  /**
   * Provides a real-time mathematical proof & audit trail comparing stored balance vs. transaction table ledger.
   */
  async auditWalletAgainstLedger(merchantId: string) {
    const syncResult = await this.syncWalletWithLedger(merchantId);
    const wallet = syncResult.wallet;

    // Aggregate by transaction type
    const aggregates = await this.transactionRepository
      .createQueryBuilder('tx')
      .select('tx.type', 'type')
      .addSelect('COUNT(tx.id)', 'count')
      .addSelect('COALESCE(SUM(tx.amount), 0)', 'totalAmount')
      .where('tx.merchantId = :merchantId', { merchantId })
      .andWhere('tx.status = :status', { status: TransactionStatus.Completed })
      .andWhere('tx.isDeleted = :isDeleted', { isDeleted: false })
      .groupBy('tx.type')
      .getRawMany();

    const summaryByType: Record<string, { count: number; totalAmount: number }> = {};
    for (const row of aggregates) {
      summaryByType[row.type] = {
        count: Number(row.count),
        totalAmount: Number(Number(row.totalAmount).toFixed(2)),
      };
    }

    return {
      merchantId,
      currency: wallet.currency,
      storedBalance: Number(wallet.balance),
      ledgerCalculatedBalance: syncResult.ledgerBalance,
      discrepancy: syncResult.discrepancy,
      isSynchronized: true,
      wasAutoReconciled: syncResult.wasReconciled,
      reservedBalance: Number(wallet.reservedBalance),
      availableBalance: Math.max(0, Number((wallet.balance - wallet.reservedBalance).toFixed(2))),
      pendingCodBalance: Number(wallet.pendingCodBalance),
      ledgerBreakdown: {
        codSettlements: summaryByType[TransactionType.CODSettlement] || { count: 0, totalAmount: 0 },
        bankTransfers: summaryByType[TransactionType.BankTransfer] || { count: 0, totalAmount: 0 },
        deposits: summaryByType[TransactionType.Deposit] || { count: 0, totalAmount: 0 },
        withdrawals: summaryByType[TransactionType.Withdrawal] || { count: 0, totalAmount: 0 },
        shipmentDeductions: summaryByType[TransactionType.ShipmentDeduction] || { count: 0, totalAmount: 0 },
      },
      auditTimestamp: new Date().toISOString(),
    };
  }

  async getWalletDashboard(merchantId: string) {
    const { wallet, ledgerBalance } = await this.syncWalletWithLedger(merchantId);
    const recentTransactions = await this.transactionRepository.find({
      where: { merchantId, isDeleted: false },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    return {
      balance: wallet.balance,
      ledgerCalculatedBalance: ledgerBalance,
      reservedBalance: wallet.reservedBalance,
      availableBalance: Math.max(0, Number((wallet.balance - wallet.reservedBalance).toFixed(2))),
      pendingCodBalance: wallet.pendingCodBalance,
      currency: wallet.currency,
      isLedgerSynchronized: true,
      recentTransactions,
    };
  }

  async getTransactions(
    merchantId: string,
    pagination: PaginationParamsDto,
    type?: TransactionType,
  ) {
    const query = this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.merchantId = :merchantId', { merchantId })
      .andWhere('tx.isDeleted = :isDeleted', { isDeleted: false });

    if (type) {
      query.andWhere('tx.type = :type', { type });
    }

    query
      .orderBy('tx.createdAt', 'DESC')
      .skip((pagination.pageNumber - 1) * pagination.pageSize)
      .take(pagination.pageSize);

    const [items, total] = await query.getManyAndCount();
    return new PagedResult(items, total, pagination.pageNumber, pagination.pageSize);
  }

  // Deduct/Reserve shipment cost
  async reserveShipmentCost(merchantId: string, amount: number) {
    const wallet = await this.getOrCreateWallet(merchantId);
    const available = wallet.balance - wallet.reservedBalance;

    if (available < amount) {
      throw new BadRequestException(
        `Insufficient wallet balance. Available: ${available} SAR, Required: ${amount} SAR. Please top up your wallet.`,
      );
    }

    wallet.reservedBalance += amount;
    await this.walletRepository.save(wallet);
    return wallet;
  }

  async releaseShipmentReservation(merchantId: string, amount: number) {
    const wallet = await this.getOrCreateWallet(merchantId);
    wallet.reservedBalance = Math.max(0, Number((wallet.reservedBalance - amount).toFixed(2)));
    await this.walletRepository.save(wallet);
  }

  /**
   * Finalizes shipping fee deduction for delivered prepaid (non-COD) shipments.
   * Releases the held reservation, deducts from the balance, and commits a Completed ShipmentDeduction ledger transaction.
   */
  async finalizeShipmentDeduction(
    merchantId: string,
    shipmentId: string,
    amount: number,
    trackingNumber?: string,
  ) {
    const existingTx = await this.transactionRepository.findOne({
      where: {
        referenceId: shipmentId,
        type: TransactionType.ShipmentDeduction,
        status: TransactionStatus.Completed,
        isDeleted: false,
      },
    });

    if (existingTx) {
      this.logger.warn(
        `Shipment ${shipmentId} fee was already deducted in transaction ${existingTx.id}. Skipping duplicate.`,
      );
      return existingTx;
    }

    const wallet = await this.getOrCreateWallet(merchantId);
    wallet.reservedBalance = Math.max(0, Number((wallet.reservedBalance - amount).toFixed(2)));
    wallet.balance = Number((wallet.balance - amount).toFixed(2));
    await this.walletRepository.save(wallet);

    const tx = this.transactionRepository.create({
      walletId: wallet.id,
      merchantId,
      amount: -amount,
      type: TransactionType.ShipmentDeduction,
      status: TransactionStatus.Completed,
      referenceId: shipmentId,
      description: `Shipping cost deduction for Delivered shipment #${trackingNumber || shipmentId}`,
      currency: wallet.currency || 'SAR',
    });
    return this.transactionRepository.save(tx);
  }

  async processCodSettlement(
    merchantId: string,
    shipmentId: string,
    codAmount: number,
    shippingCost: number,
  ) {
    const existingTx = await this.transactionRepository.findOne({
      where: {
        referenceId: shipmentId,
        type: TransactionType.CODSettlement,
        status: TransactionStatus.Completed,
        isDeleted: false,
      },
    });

    if (existingTx) {
      this.logger.warn(
        `Shipment ${shipmentId} COD was already settled in transaction ${existingTx.id}. Skipping duplicate credit.`,
      );
      return existingTx;
    }

    const wallet = await this.getOrCreateWallet(merchantId);
    const netCredit = Math.max(0, codAmount - shippingCost);

    // Credit net COD to balance
    wallet.balance = Number((wallet.balance + netCredit).toFixed(2));
    // Release any shipping cost reserve if held
    wallet.reservedBalance = Math.max(0, Number((wallet.reservedBalance - shippingCost).toFixed(2)));
    // Deduct from pending COD balance
    wallet.pendingCodBalance = Math.max(0, Number((wallet.pendingCodBalance - codAmount).toFixed(2)));
    await this.walletRepository.save(wallet);

    const description = `COD Settlement for Shipment (Collected: ${codAmount} SAR, Deducted Shipping: ${shippingCost} SAR)`;

    // Record COD settlement transaction
    const tx = this.transactionRepository.create({
      walletId: wallet.id,
      merchantId,
      amount: netCredit,
      type: TransactionType.CODSettlement,
      status: TransactionStatus.Completed,
      referenceId: shipmentId,
      description,
      currency: 'SAR',
    });
    await this.transactionRepository.save(tx);

    // Emit Domain Event for Decoupled Modules
    this.eventEmitter.emit(
      DomainEventNames.WALLET_CREDITED,
      new WalletCreditedEvent(
        merchantId,
        wallet.id,
        netCredit,
        TransactionType.CODSettlement,
        shipmentId,
        description,
      ),
    );
  }

  // Payment Top Up
  async initiateDeposit(merchantId: string, dto: InitiateDepositDto) {
    const wallet = await this.getOrCreateWallet(merchantId);
    const description = `Online Top-up via ${dto.paymentMethod || 'Credit Card'}`;

    // Instant top-up simulation for online payment gateway (MyFatoorah demo flow)
    wallet.balance += dto.amount;
    await this.walletRepository.save(wallet);

    const tx = this.transactionRepository.create({
      walletId: wallet.id,
      merchantId,
      amount: dto.amount,
      type: TransactionType.Deposit,
      status: TransactionStatus.Completed,
      description,
      currency: 'SAR',
    });
    await this.transactionRepository.save(tx);

    // Emit Domain Event for Decoupled Modules
    this.eventEmitter.emit(
      DomainEventNames.WALLET_CREDITED,
      new WalletCreditedEvent(
        merchantId,
        wallet.id,
        dto.amount,
        TransactionType.Deposit,
        undefined,
        description,
      ),
    );

    return {
      isSuccess: true,
      message: `Deposit of ${dto.amount} SAR completed successfully`,
      newBalance: wallet.balance,
      currency: 'SAR',
    };
  }
}
