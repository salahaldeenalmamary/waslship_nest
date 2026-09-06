import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WithdrawalRequest } from '../entities/withdrawal-request.entity';
import { UserBankAccount } from '../../users/entities/user-bank-account.entity';
import { Wallet } from '../entities/wallet.entity';
import { WalletTransaction } from '../entities/transaction.entity';
import { User } from '../../users/entities/user.entity';
import {
  WithdrawalStatus,
  TransactionStatus,
  TransactionType,
} from '../enums/wallet.enum';
import {
  CreateWithdrawalRequestDto,
  ReviewWithdrawalRequestDto,
} from '../dtos/wallet.dto';
import { PaginationParamsDto, PagedResult } from '../../../common/dtos/pagination.dto';
import { WalletService } from './wallet.service';
import {
  DomainEventNames,
  WithdrawalRequestedEvent,
  WithdrawalReviewedEvent,
} from '../../../common/events/domain-events';

@Injectable()
export class WithdrawalRequestService {
  private readonly logger = new Logger(WithdrawalRequestService.name);

  constructor(
    @InjectRepository(WithdrawalRequest)
    private readonly withdrawalRepository: Repository<WithdrawalRequest>,
    @InjectRepository(UserBankAccount)
    private readonly userBankAccountRepository: Repository<UserBankAccount>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
    private readonly walletService: WalletService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createWithdrawalRequest(
    merchantId: string,
    dto: CreateWithdrawalRequestDto,
  ): Promise<WithdrawalRequest> {
    const bankAccount = await this.userBankAccountRepository.findOne({
      where: { id: dto.userBankAccountId, isDeleted: false },
    });
    if (!bankAccount) {
      throw new NotFoundException(`Bank account with ID "${dto.userBankAccountId}" not found`);
    }

    const wallet = await this.walletService.getOrCreateWallet(merchantId);
    const availableBalance = wallet.balance - wallet.reservedBalance;
    if (availableBalance < dto.amount) {
      throw new BadRequestException(
        `Insufficient wallet balance for withdrawal. Available: ${availableBalance} SAR, Requested: ${dto.amount} SAR`,
      );
    }

    const withdrawal = this.withdrawalRepository.create({
      merchantId,
      userBankAccountId: dto.userBankAccountId,
      userBankAccount: bankAccount,
      amount: dto.amount,
      status: WithdrawalStatus.Pending,
    });
    const saved = await this.withdrawalRepository.save(withdrawal);

    this.eventEmitter.emit(
      DomainEventNames.WITHDRAWAL_REQUESTED,
      new WithdrawalRequestedEvent(
        saved.id,
        merchantId,
        saved.amount,
        saved.userBankAccountId,
      ),
    );

    return saved;
  }

  async getMerchantWithdrawalRequests(merchantId: string): Promise<WithdrawalRequest[]> {
    return this.withdrawalRepository.find({
      where: { merchantId, isDeleted: false },
      relations: ['userBankAccount'],
      order: { createdAt: 'DESC' },
    });
  }

  async getWithdrawalRequestById(
    id: string,
    merchantId?: string,
  ): Promise<WithdrawalRequest> {
    const where: any = { id, isDeleted: false };
    if (merchantId) {
      where.merchantId = merchantId;
    }
    const withdrawal = await this.withdrawalRepository.findOne({
      where,
      relations: ['userBankAccount'],
    });
    if (!withdrawal) {
      throw new NotFoundException(`Withdrawal request with ID "${id}" not found`);
    }
    return withdrawal;
  }

  async getAllWithdrawalRequestsAdmin(
    pagination: PaginationParamsDto,
    status?: WithdrawalStatus,
  ): Promise<PagedResult<WithdrawalRequest>> {
    const query = this.withdrawalRepository
      .createQueryBuilder('wr')
      .leftJoinAndSelect('wr.userBankAccount', 'userBankAccount')
      .leftJoinAndMapOne(
        'wr.merchant',
        User,
        'merchant',
        'merchant.id = wr.merchantId',
      )
      .where('wr.isDeleted = :isDeleted', { isDeleted: false });

    if (status) {
      query.andWhere('wr.status = :status', { status });
    }

    query
      .orderBy('wr.createdAt', 'DESC')
      .skip((pagination.pageNumber - 1) * pagination.pageSize)
      .take(pagination.pageSize);

    const [items, total] = await query.getManyAndCount();
    return new PagedResult(items, total, pagination.pageNumber, pagination.pageSize);
  }

  async reviewWithdrawalRequest(
    withdrawalId: string,
    adminId: string,
    dto: ReviewWithdrawalRequestDto,
  ): Promise<WithdrawalRequest> {
    const withdrawal = await this.withdrawalRepository.findOne({
      where: { id: withdrawalId, isDeleted: false },
      relations: ['userBankAccount'],
    });
    if (!withdrawal) throw new NotFoundException('Withdrawal request not found');

    if (withdrawal.status === WithdrawalStatus.Approved) {
      throw new BadRequestException('Withdrawal request has already been approved');
    }

    withdrawal.status = dto.status;
    if (dto.adminNotes) {
      withdrawal.adminNotes = dto.adminNotes;
    }
    withdrawal.reviewedByAdminId = adminId;
    if (dto.proofImageUrl) {
      withdrawal.proofImageUrl = dto.proofImageUrl;
    }

    if (dto.status === WithdrawalStatus.Approved) {
      const wallet = await this.walletService.getOrCreateWallet(withdrawal.merchantId);
      if (wallet.balance < withdrawal.amount) {
        throw new BadRequestException(
          `Cannot approve withdrawal. Wallet balance (${wallet.balance} SAR) is less than requested withdrawal amount (${withdrawal.amount} SAR).`,
        );
      }

      // Deduct balance from merchant wallet
      wallet.balance -= withdrawal.amount;
      await this.walletRepository.save(wallet);

      const bankName = withdrawal.userBankAccount?.bankName || 'Bank Account';
      const accountNumber = withdrawal.userBankAccount?.accountNumber || '';
      const description = `Withdrawal payout to ${bankName} (${accountNumber}) Approved by Admin`;

      // Record WalletTransaction movement
      const tx = this.transactionRepository.create({
        walletId: wallet.id,
        merchantId: withdrawal.merchantId,
        amount: -withdrawal.amount,
        type: TransactionType.Withdrawal,
        status: TransactionStatus.Completed,
        referenceId: withdrawal.id,
        description,
        currency: 'SAR',
      });
      await this.transactionRepository.save(tx);
    }

    const updated = await this.withdrawalRepository.save(withdrawal);

    // Emit domain event for notification triggers
    this.eventEmitter.emit(
      DomainEventNames.WITHDRAWAL_REVIEWED,
      new WithdrawalReviewedEvent(
        updated.id,
        updated.merchantId,
        updated.amount,
        updated.status,
        updated.proofImageUrl,
        updated.adminNotes,
        adminId,
      ),
    );

    return updated;
  }
}
