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

  async getWalletDashboard(merchantId: string) {
    const wallet = await this.getOrCreateWallet(merchantId);
    const recentTransactions = await this.transactionRepository.find({
      where: { merchantId, isDeleted: false },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    return {
      balance: wallet.balance,
      reservedBalance: wallet.reservedBalance,
      availableBalance: Math.max(0, wallet.balance - wallet.reservedBalance),
      pendingCodBalance: wallet.pendingCodBalance,
      currency: wallet.currency,
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
    wallet.reservedBalance = Math.max(0, wallet.reservedBalance - amount);
    await this.walletRepository.save(wallet);
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
