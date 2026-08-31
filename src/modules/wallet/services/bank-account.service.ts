import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankAccount } from '../entities/bank-account.entity';
import { CreateBankAccountDto, UpdateBankAccountDto } from '../dtos/wallet.dto';

@Injectable()
export class BankAccountService {
  constructor(
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
  ) {}

  async createBankAccount(dto: CreateBankAccountDto): Promise<BankAccount> {
    const bankAccount = this.bankAccountRepository.create(dto);
    return this.bankAccountRepository.save(bankAccount);
  }

  async getBankAccounts(onlyActive = false): Promise<BankAccount[]> {
    const where: any = { isDeleted: false };
    if (onlyActive) {
      where.isActive = true;
    }
    return this.bankAccountRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async getBankAccountById(
    id: string,
    includePayments = false,
  ): Promise<BankAccount> {
    const relations = includePayments ? ['payments'] : [];
    const bankAccount = await this.bankAccountRepository.findOne({
      where: { id, isDeleted: false },
      relations,
    });
    if (!bankAccount) {
      throw new NotFoundException(`Bank account with ID "${id}" not found`);
    }
    return bankAccount;
  }

  async updateBankAccount(
    id: string,
    dto: UpdateBankAccountDto,
  ): Promise<BankAccount> {
    const bankAccount = await this.getBankAccountById(id);
    Object.assign(bankAccount, dto);
    return this.bankAccountRepository.save(bankAccount);
  }

  async deleteBankAccount(id: string): Promise<void> {
    const bankAccount = await this.getBankAccountById(id, true);
    bankAccount.isDeleted = true;
    await this.bankAccountRepository.save(bankAccount);
  }

  async validateAccountForTransfer(id: string): Promise<BankAccount> {
    const bankAccount = await this.getBankAccountById(id);
    if (!bankAccount.isActive) {
      throw new BadRequestException(
        `Bank account "${bankAccount.bankName}" is currently inactive`,
      );
    }
    return bankAccount;
  }
}
