import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UserBankAccountService } from '../services/user-bank-account.service';
import { CurrentUser } from '../../auth/current-user.decorator';
import {
  CreateUserBankAccountDto,
  UpdateUserBankAccountDto,
} from '../dtos/user-bank-account.dto';

@ApiTags('User Bank Accounts')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('api/users/bank-accounts')
export class UserBankAccountController {
  constructor(
    private readonly userBankAccountService: UserBankAccountService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get logged in user bank accounts for withdrawals' })
  async getUserBankAccounts(@CurrentUser('id') userId: string) {
    return this.userBankAccountService.getUserBankAccounts(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user bank account by ID' })
  async getUserBankAccountById(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.userBankAccountService.getUserBankAccountById(userId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Add a new bank account for withdrawal' })
  async createUserBankAccount(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateUserBankAccountDto,
  ) {
    return this.userBankAccountService.createUserBankAccount(userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a user bank account' })
  async updateUserBankAccount(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserBankAccountDto,
  ) {
    return this.userBankAccountService.updateUserBankAccount(userId, id, dto);
  }

  @Put(':id/default')
  @ApiOperation({ summary: 'Set bank account as default for withdrawals' })
  async setDefaultUserBankAccount(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.userBankAccountService.setDefaultUserBankAccount(userId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user bank account' })
  async deleteUserBankAccount(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    await this.userBankAccountService.deleteUserBankAccount(userId, id);
    return { message: 'Bank account deleted successfully' };
  }
}
