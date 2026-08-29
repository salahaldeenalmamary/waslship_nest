import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { NotificationType } from '../notifications/enums/notification.enum';

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

    // Record COD settlement transaction
    const tx = this.transactionRepository.create({
      walletId: wallet.id,
      merchantId,
      amount: netCredit,
      type: TransactionType.CODSettlement,
      status: TransactionStatus.Completed,
      referenceId: shipmentId,
      description: `COD Settlement for Shipment (Collected: ${codAmount} SAR, Deducted Shipping: ${shippingCost} SAR)`,
      currency: 'SAR',
    });
    await this.transactionRepository.save(tx);

    await this.notificationsService.sendNotification({
      userId: merchantId,
      title: 'COD Payment Settled',
      body: `Net amount of ${netCredit} SAR has been credited to your wallet for delivery #${shipmentId.slice(0, 8)}.`,
      type: NotificationType.WalletCredited,
    });
  }

  // Payment Top Up
  async initiateDeposit(merchantId: string, dto: InitiateDepositDto) {
    const wallet = await this.getOrCreateWallet(merchantId);

    // Instant top-up simulation for online payment gateway (MyFatoorah demo flow)
    wallet.balance += dto.amount;
    await this.walletRepository.save(wallet);

    const tx = this.transactionRepository.create({
      walletId: wallet.id,
      merchantId,
      amount: dto.amount,
      type: TransactionType.Deposit,
      status: TransactionStatus.Completed,
      description: `Online Top-up via ${dto.paymentMethod || 'Credit Card'}`,
      currency: 'SAR',
    });
    await this.transactionRepository.save(tx);

    await this.notificationsService.sendNotification({
      userId: merchantId,
      title: 'Wallet Recharged',
      body: `Your wallet has been credited with ${dto.amount} SAR.`,
      type: NotificationType.WalletCredited,
    });

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
    return this.bankTransferRepository.save(payment);
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

      const tx = this.transactionRepository.create({
        walletId: wallet.id,
        merchantId: transfer.merchantId,
        amount: transfer.amount,
        type: TransactionType.BankTransfer,
        status: TransactionStatus.Completed,
        referenceId: transfer.id,
        description: `Bank Transfer Top-up (${transfer.bankName}) Approved by Admin`,
        currency: 'SAR',
      });
      await this.transactionRepository.save(tx);

      await this.notificationsService.sendNotification({
        userId: transfer.merchantId,
        title: 'Bank Transfer Approved',
        body: `Your bank transfer of ${transfer.amount} SAR has been verified and added to your balance.`,
        type: NotificationType.BankTransferApproved,
      });
    } else if (dto.status === BankTransferStatus.Rejected) {
      await this.notificationsService.sendNotification({
        userId: transfer.merchantId,
        title: 'Bank Transfer Rejected',
        body: `Your transfer of ${transfer.amount} SAR was rejected. Reason: ${dto.adminNotes || 'Verification failed'}`,
        type: NotificationType.BankTransferRejected,
      });
    }

    return transfer;
  }
}
