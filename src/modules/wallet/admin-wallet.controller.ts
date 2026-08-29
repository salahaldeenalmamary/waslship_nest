import {
  Controller,
  Get,
  Put,
  Param,
  Query,
  Body,
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
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/enums/user.enum';
import { BankTransferStatus } from './enums/wallet.enum';
import { ReviewBankTransferDto } from './dtos/wallet.dto';
import { PaginationParamsDto } from '../../common/dtos/pagination.dto';

@ApiTags('Admin Bank Transfers & Financials')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.Admin, UserRole.SuperAdmin)
@Controller('api/admin/bank-transfers')
export class AdminWalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'List all pending/reviewed bank transfers (Admin)' })
  @ApiQuery({ name: 'status', enum: BankTransferStatus, required: false })
  async getAllBankTransfers(
    @Query() pagination: PaginationParamsDto,
    @Query('status') status?: BankTransferStatus,
  ) {
    return this.walletService.getAllBankTransfersAdmin(pagination, status);
  }

  @Put(':id/review')
  @ApiOperation({ summary: 'Approve or Reject Bank Transfer (Admin)' })
  async reviewBankTransfer(
    @CurrentUser('id') adminId: string,
    @Param('id') transferId: string,
    @Body() dto: ReviewBankTransferDto,
  ) {
    return this.walletService.reviewBankTransfer(transferId, adminId, dto);
  }
}
