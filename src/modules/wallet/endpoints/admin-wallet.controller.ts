import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Query,
  Body,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiConsumes,
  ApiBody,
  ApiProduces,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { BankTransferPaymentService } from '../services/bank-transfer-payment.service';
import { WithdrawalRequestService } from '../services/withdrawal-request.service';
import { FinancialStatementService } from '../services/financial-statement.service';
import { StorageService } from '../../storage/services/storage.service';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../users/enums/user.enum';
import { BankTransferStatus, WithdrawalStatus } from '../enums/wallet.enum';
import { ReviewBankTransferDto, ReviewWithdrawalRequestDto } from '../dtos/wallet.dto';
import { MonthlyStatementQueryDto } from '../dtos/financial-statement.dto';
import { PaginationParamsDto } from '../../../common/dtos/pagination.dto';

@ApiTags('Admin Bank Transfers & Financials')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.Admin, UserRole.SuperAdmin)
@Controller('api/admin')
export class AdminWalletController {
  constructor(
    private readonly bankTransferPaymentService: BankTransferPaymentService,
    private readonly withdrawalRequestService: WithdrawalRequestService,
    private readonly financialStatementService: FinancialStatementService,
    private readonly storageService: StorageService,
  ) {}

  @Get('bank-transfers')
  @ApiOperation({ summary: 'List all pending/reviewed bank transfers (Admin)' })
  @ApiQuery({ name: 'status', enum: BankTransferStatus, required: false })
  async getAllBankTransfers(
    @Query() pagination: PaginationParamsDto,
    @Query('status') status?: BankTransferStatus,
  ) {
    return this.bankTransferPaymentService.getAllBankTransfersAdmin(pagination, status);
  }

  @Put('bank-transfers/:id/review')
  @ApiOperation({ summary: 'Approve or Reject Bank Transfer (Admin)' })
  async reviewBankTransfer(
    @CurrentUser('id') adminId: string,
    @Param('id') transferId: string,
    @Body() dto: ReviewBankTransferDto,
  ) {
    return this.bankTransferPaymentService.reviewBankTransfer(transferId, adminId, dto);
  }

  // --- Withdrawal Request Admin Management ---
  @Get('withdrawals')
  @ApiOperation({ summary: 'List all merchant withdrawal requests (Admin)' })
  @ApiQuery({ name: 'status', enum: WithdrawalStatus, required: false })
  async getAllWithdrawalRequests(
    @Query() pagination: PaginationParamsDto,
    @Query('status') status?: WithdrawalStatus,
  ) {
    return this.withdrawalRequestService.getAllWithdrawalRequestsAdmin(pagination, status);
  }

  @Put('withdrawals/:id/review')
  @ApiOperation({ summary: 'Approve or Reject Withdrawal Request (Admin)' })
  async reviewWithdrawalRequest(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body() dto: ReviewWithdrawalRequestDto,
  ) {
    return this.withdrawalRequestService.reviewWithdrawalRequest(id, adminId, dto);
  }

  @Post('withdrawals/:id/approve-with-proof')
  @ApiOperation({ summary: 'Approve withdrawal request and upload profit/transfer proof image in one request' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        adminNotes: { type: 'string', example: 'Bank payout executed successfully' },
        proofFile: {
          type: 'string',
          format: 'binary',
          description: 'Transfer receipt/profit proof image file',
        },
      },
      required: ['proofFile'],
    },
  })
  @UseInterceptors(FileInterceptor('proofFile'))
  async approveWithdrawalWithProof(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body('adminNotes') adminNotes: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 })],
        fileIsRequired: true,
      }),
    )
    proofFile: Express.Multer.File,
    @Req() req: Request,
  ) {
    // 1. Upload proof file via storage service
    const attachment = await this.storageService.handleFileUpload(
      proofFile,
      req,
      {
        entityType: 'WithdrawalRequest',
        entityId: id,
        tag: 'proof',
      },
      adminId,
    );

    // 2. Review and approve withdrawal request with uploaded proof URL
    const result = await this.withdrawalRequestService.reviewWithdrawalRequest(id, adminId, {
      status: WithdrawalStatus.Approved,
      proofImageUrl: attachment.url,
      adminNotes: adminNotes || 'Approved with attached payout receipt',
    });

    return {
      message: 'Withdrawal approved and profit proof attached successfully',
      withdrawal: result,
      attachment,
    };
  }

  // ==========================================
  // ADMIN MERCHANT MONTHLY FINANCIAL STATEMENTS
  // ==========================================

  @Get('statements/merchant/:merchantId')
  @ApiOperation({
    summary:
      'Get monthly financial statement, shipping fees & ZATCA tax report for any merchant (Admin)',
  })
  async getMerchantMonthlyStatement(
    @Param('merchantId') merchantId: string,
    @Query() query: MonthlyStatementQueryDto,
  ) {
    return this.financialStatementService.getMonthlyStatementData(
      merchantId,
      query.month,
    );
  }

  @Get('statements/merchant/:merchantId/csv')
  @ApiOperation({
    summary:
      'Download monthly financial statement CSV for any merchant (Admin)',
  })
  @ApiProduces('text/csv')
  async exportMerchantMonthlyStatementCsv(
    @Param('merchantId') merchantId: string,
    @Query() query: MonthlyStatementQueryDto,
    @Res() res: Response,
  ) {
    const result =
      await this.financialStatementService.generateMonthlyStatementCsv(
        merchantId,
        query.month,
      );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.status(200).send(`\uFEFF${result.csvContent}`);
  }

  @Get('statements/merchant/:merchantId/pdf')
  @ApiOperation({
    summary:
      'Download monthly financial statement PDF for any merchant (Admin)',
  })
  @ApiProduces('application/pdf')
  async exportMerchantMonthlyStatementPdf(
    @Param('merchantId') merchantId: string,
    @Query() query: MonthlyStatementQueryDto,
    @Res() res: Response,
  ) {
    const result =
      await this.financialStatementService.generateMonthlyStatementPdf(
        merchantId,
        query.month,
      );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader('Content-Length', result.pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.status(200).end(result.pdfBuffer);
  }
}
