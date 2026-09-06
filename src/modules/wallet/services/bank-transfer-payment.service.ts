import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BankTransferPayment } from '../entities/bank-transfer-payment.entity';
import { BankAccount } from '../entities/bank-account.entity';
import { Wallet } from '../entities/wallet.entity';
import { WalletTransaction } from '../entities/transaction.entity';
import { User } from '../../users/entities/user.entity';
import {
  BankTransferStatus,
  TransactionStatus,
  TransactionType,
} from '../enums/wallet.enum';
import {
  CreateBankTransferPaymentDto,
  ReviewBankTransferDto,
} from '../dtos/wallet.dto';
import { PaginationParamsDto, PagedResult } from '../../../common/dtos/pagination.dto';
import { WalletService } from './wallet.service';
import {
  DomainEventNames,
  BankTransferCreatedEvent,
  BankTransferReviewedEvent,
} from '../../../common/events/domain-events';

@Injectable()
export class BankTransferPaymentService {
  private readonly logger = new Logger(BankTransferPaymentService.name);

  constructor(
    @InjectRepository(BankTransferPayment)
    private readonly bankTransferRepository: Repository<BankTransferPayment>,
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
    private readonly walletService: WalletService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createBankTransfer(
    merchantId: string,
    dto: CreateBankTransferPaymentDto,
  ): Promise<BankTransferPayment> {
    const bankAccount = await this.bankAccountRepository.findOne({
      where: { id: dto.bankAccountId, isDeleted: false },
    });
    if (!bankAccount) {
      throw new NotFoundException(`Bank account with ID "${dto.bankAccountId}" not found`);
    }
    if (!bankAccount.isActive) {
      throw new BadRequestException(`Bank account "${bankAccount.bankName}" is currently inactive`);
    }

    const payment = this.bankTransferRepository.create({
      amount: dto.amount,
      bankAccountId: dto.bankAccountId,
      bankAccount,
      receiptUrl: dto.receiptUrl,
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
        saved.bankAccountId,
        bankAccount.bankName,
        bankAccount.accountNumber,
        saved.receiptUrl,
      ),
    );

    return saved;
  }

  async getMerchantBankTransfers(merchantId: string): Promise<BankTransferPayment[]> {
    return this.bankTransferRepository.find({
      where: { merchantId, isDeleted: false },
      relations: ['bankAccount'],
      order: { createdAt: 'DESC' },
    });
  }

  async getBankTransferById(
    transferId: string,
    merchantId?: string,
  ): Promise<BankTransferPayment> {
    const where: any = { id: transferId, isDeleted: false };
    if (merchantId) {
      where.merchantId = merchantId;
    }
    const transfer = await this.bankTransferRepository.findOne({
      where,
      relations: ['bankAccount'],
    });
    if (!transfer) {
      throw new NotFoundException(`Bank transfer with ID "${transferId}" not found`);
    }
    return transfer;
  }

  async updateReceiptUrl(
    transferId: string,
    receiptUrl: string,
    merchantId?: string,
  ): Promise<BankTransferPayment> {
    const transfer = await this.getBankTransferById(transferId, merchantId);
    transfer.receiptUrl = receiptUrl;
    return this.bankTransferRepository.save(transfer);
  }

  async getAllBankTransfersAdmin(
    pagination: PaginationParamsDto,
    status?: BankTransferStatus,
  ): Promise<PagedResult<BankTransferPayment>> {
    const query = this.bankTransferRepository
      .createQueryBuilder('bt')
      .leftJoinAndSelect('bt.bankAccount', 'bankAccount')
      .leftJoinAndMapOne(
        'bt.merchant',
        User,
        'merchant',
        'merchant.id = bt.merchantId',
      )
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
  ): Promise<BankTransferPayment> {
    const transfer = await this.bankTransferRepository.findOne({
      where: { id: transferId, isDeleted: false },
      relations: ['bankAccount'],
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
      const wallet = await this.walletService.getOrCreateWallet(transfer.merchantId);
      wallet.balance += transfer.amount;
      await this.walletRepository.save(wallet);

      const bankName = transfer.bankAccount?.bankName || 'Bank';
      const description = `Bank Transfer Top-up (${bankName}) Approved by Admin`;
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

    // Emit Domain Event for Decoupled Modules
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
