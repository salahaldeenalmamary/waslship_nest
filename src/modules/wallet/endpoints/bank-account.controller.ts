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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { BankAccountService } from '../services/bank-account.service';
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../users/enums/user.enum';
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
} from '../dtos/wallet.dto';

@ApiTags('Bank Accounts')
@Controller('api/bank-accounts')
export class BankAccountController {
  constructor(private readonly bankAccountService: BankAccountService) {}

  @Get()
  @ApiOperation({ summary: 'Get active company bank accounts for transfers' })
  async getActiveBankAccounts() {
    return this.bankAccountService.getBankAccounts(true);
  }
}

@ApiTags('Admin Bank Accounts')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.Admin, UserRole.SuperAdmin)
@Controller('api/admin/bank-accounts')
export class AdminBankAccountController {
  constructor(private readonly bankAccountService: BankAccountService) {}

  @Post()
  @ApiOperation({ summary: 'Create official company bank account (Admin)' })
  async createBankAccount(@Body() dto: CreateBankAccountDto) {
    return this.bankAccountService.createBankAccount(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all company bank accounts including inactive (Admin)' })
  async getAllBankAccounts() {
    return this.bankAccountService.getBankAccounts(false);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bank account details (Admin)' })
  async getBankAccountById(@Param('id') id: string) {
    return this.bankAccountService.getBankAccountById(id, true);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update bank account details (Admin)' })
  async updateBankAccount(
    @Param('id') id: string,
    @Body() dto: UpdateBankAccountDto,
  ) {
    return this.bankAccountService.updateBankAccount(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete bank account (Admin)' })
  async deleteBankAccount(@Param('id') id: string) {
    await this.bankAccountService.deleteBankAccount(id);
    return { message: 'Bank account deleted successfully' };
  }
}
