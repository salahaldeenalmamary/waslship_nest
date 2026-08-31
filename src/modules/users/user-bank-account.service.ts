import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserBankAccount } from './entities/user-bank-account.entity';
import {
  CreateUserBankAccountDto,
  UpdateUserBankAccountDto,
} from './dtos/user-bank-account.dto';

@Injectable()
export class UserBankAccountService {
  constructor(
    @InjectRepository(UserBankAccount)
    private readonly userBankAccountRepository: Repository<UserBankAccount>,
  ) {}

  async getUserBankAccounts(userId: string): Promise<UserBankAccount[]> {
    return this.userBankAccountRepository.find({
      where: { userId, isDeleted: false },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  async getUserBankAccountById(
    userId: string,
    id: string,
  ): Promise<UserBankAccount> {
    const bankAccount = await this.userBankAccountRepository.findOne({
      where: { id, userId, isDeleted: false },
    });
    if (!bankAccount) {
      throw new NotFoundException(`User bank account with ID "${id}" not found`);
    }
    return bankAccount;
  }

  async createUserBankAccount(
    userId: string,
    dto: CreateUserBankAccountDto,
  ): Promise<UserBankAccount> {
    if (dto.isDefault) {
      await this.userBankAccountRepository.update(
        { userId, isDeleted: false },
        { isDefault: false },
      );
    }

    const bankAccount = this.userBankAccountRepository.create({
      ...dto,
      userId,
    });
    return this.userBankAccountRepository.save(bankAccount);
  }

  async updateUserBankAccount(
    userId: string,
    id: string,
    dto: UpdateUserBankAccountDto,
  ): Promise<UserBankAccount> {
    const bankAccount = await this.getUserBankAccountById(userId, id);

    if (dto.isDefault) {
      await this.userBankAccountRepository.update(
        { userId, isDeleted: false },
        { isDefault: false },
      );
    }

    Object.assign(bankAccount, dto);
    return this.userBankAccountRepository.save(bankAccount);
  }

  async setDefaultUserBankAccount(
    userId: string,
    id: string,
  ): Promise<UserBankAccount> {
    const bankAccount = await this.getUserBankAccountById(userId, id);

    await this.userBankAccountRepository.update(
      { userId, isDeleted: false },
      { isDefault: false },
    );

    bankAccount.isDefault = true;
    return this.userBankAccountRepository.save(bankAccount);
  }

  async deleteUserBankAccount(userId: string, id: string): Promise<void> {
    const bankAccount = await this.getUserBankAccountById(userId, id);
    bankAccount.isDeleted = true;
    await this.userBankAccountRepository.save(bankAccount);
  }
}
