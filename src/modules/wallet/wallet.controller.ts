import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { WalletService } from './wallet.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { TransactionType } from './enums/wallet.enum';
import {
  InitiateDepositDto,
  CreateBankTransferPaymentDto,
} from './dtos/wallet.dto';
import { PaginationParamsDto } from '../../common/dtos/pagination.dto';

@ApiTags('Merchant Wallet & Transactions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('api/wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get wallet balance, reserved funds & recent history' })
  async getWalletDashboard(@CurrentUser('id') merchantId: string) {
    return this.walletService.getWalletDashboard(merchantId);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get merchant transaction ledger' })
  @ApiQuery({ name: 'type', enum: TransactionType, required: false })
  async getTransactions(
    @CurrentUser('id') merchantId: string,
    @Query() pagination: PaginationParamsDto,
    @Query('type') type?: TransactionType,
  ) {
    return this.walletService.getTransactions(merchantId, pagination, type);
  }

  @Post('deposit')
  @ApiOperation({ summary: 'Recharge wallet balance (Online Payment Gateway / Instant Top-Up)' })
  async deposit(
    @CurrentUser('id') merchantId: string,
    @Body() dto: InitiateDepositDto,
  ) {
    return this.walletService.initiateDeposit(merchantId, dto);
  }

  @Post('bank-transfers')
  @ApiOperation({ summary: 'Submit manual bank transfer receipt for verification' })
  async createBankTransfer(
    @CurrentUser('id') merchantId: string,
    @Body() dto: CreateBankTransferPaymentDto,
  ) {
    return this.walletService.createBankTransfer(merchantId, dto);
  }

  @Get('bank-transfers')
  @ApiOperation({ summary: 'List merchant submitted bank transfers' })
  async getMyBankTransfers(@CurrentUser('id') merchantId: string) {
    return this.walletService.getMerchantBankTransfers(merchantId);
  }
}
