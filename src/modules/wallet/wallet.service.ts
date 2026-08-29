import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Wallet } from './entities/wallet.entity';
import { WalletTransaction } from './entities/transaction.entity';
import { BankTransferPayment } from './entities/bank-transfer-payment.entity';
import {
  BankTransferStatus,
  TransactionStatus,
  TransactionType,
} from './enums/wallet.enum';
import {
  InitiateDepositDto,
  CreateBankTransferPaymentDto,
  ReviewBankTransferDto,
} from './dtos/wallet.dto';
import { PaginationParamsDto, PagedResult } from '../../common/dtos/pagination.dto';
import { NotificationsService } from '../notifications/notifications.service';
import {
  DomainEventNames,
  WalletCreditedEvent,
  BankTransferCreatedEvent,
  BankTransferReviewedEvent,
} from '../../common/events/domain-events';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
    @InjectRepository(BankTransferPayment)
    private readonly bankTransferRepository: Repository<BankTransferPayment>,
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
    const wallet = await this.getOrCreateWallet(merchantId);
    const netCredit = codAmount - shippingCost;

    // Credit net COD to balance
    wallet.balance += netCredit;
    // Release any shipping cost reserve if held
    wallet.reservedBalance = Math.max(0, wallet.reservedBalance - shippingCost);
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

  // Bank Transfer Workflow
  async createBankTransfer(
    merchantId: string,
    dto: CreateBankTransferPaymentDto,
  ) {
    const payment = this.bankTransferRepository.create({
      ...dto,
      merchantId,
      status: BankTransferStatus.Pending,
    });
    const saved = await this.bankTransferRepository.save(payment);

    // Emit Domain Event
    this.eventEmitter.emit(
      DomainEventNames.BANK_TRANSFER_CREATED,
      new BankTransferCreatedEvent(
        saved.id,
        merchantId,
        saved.amount,
        saved.bankName,
        saved.accountNumber,
        saved.receiptUrl,
      ),
    );

    return saved;
  }

  async getMerchantBankTransfers(merchantId: string) {
    return this.bankTransferRepository.find({
      where: { merchantId, isDeleted: false },
      order: { createdAt: 'DESC' },
    });
  }

  // Admin Bank Transfer Actions
  async getAllBankTransfersAdmin(
    pagination: PaginationParamsDto,
    status?: BankTransferStatus,
  ) {
    const query = this.bankTransferRepository
      .createQueryBuilder('bt')
      .where('bt.isDeleted = :isDeleted', { isDeleted: false });

    if (status) {
      query.andWhere('bt.status = :status', { status });
    }

    query
      .orderBy('bt.createdAt', 'DESC')
      .skip((pagination.pageNumber - 1) * pagination.pageSize)
      .take(pagination.pageSize);

    const [items, total] = await query.getManyAndCount();
    return new PagedResult(items, total, pagination.pageNumber, pagination.pageSize);
  }

  async reviewBankTransfer(
    transferId: string,
    adminId: string,
    dto: ReviewBankTransferDto,
  ) {
    const transfer = await this.bankTransferRepository.findOne({
      where: { id: transferId, isDeleted: false },
    });
    if (!transfer) throw new NotFoundException('Bank transfer not found');

    if (transfer.status === BankTransferStatus.Approved) {
      throw new BadRequestException('Transfer has already been approved');
    }

    transfer.status = dto.status;
    transfer.adminNotes = dto.adminNotes;
    transfer.reviewedByAdminId = adminId;
    await this.bankTransferRepository.save(transfer);

    if (dto.status === BankTransferStatus.Approved) {
      const wallet = await this.getOrCreateWallet(transfer.merchantId);
      wallet.balance += transfer.amount;
      await this.walletRepository.save(wallet);

      const description = `Bank Transfer Top-up (${transfer.bankName}) Approved by Admin`;
      const tx = this.transactionRepository.create({
        walletId: wallet.id,
        merchantId: transfer.merchantId,
        amount: transfer.amount,
        type: TransactionType.BankTransfer,
        status: TransactionStatus.Completed,
        referenceId: transfer.id,
        description,
        currency: 'SAR',
      });
      await this.transactionRepository.save(tx);
    }

    // Emit Domain Event for Decoupled Modules (Notifications, Audit, etc.)
    this.eventEmitter.emit(
      DomainEventNames.BANK_TRANSFER_REVIEWED,
      new BankTransferReviewedEvent(
        transfer.id,
        transfer.merchantId,
        transfer.amount,
        dto.status,
        dto.adminNotes,
        adminId,
      ),
    );

    return transfer;
  }
}
