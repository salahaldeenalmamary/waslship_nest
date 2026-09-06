import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
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
import { WalletService } from '../services/wallet.service';
import { BankTransferPaymentService } from '../services/bank-transfer-payment.service';
import { WithdrawalRequestService } from '../services/withdrawal-request.service';
import { FinancialStatementService } from '../services/financial-statement.service';
import { StorageService } from '../../storage/services/storage.service';
import { CurrentUser } from '../../auth/current-user.decorator';
import { TransactionType } from '../enums/wallet.enum';
import {
  InitiateDepositDto,
  CreateBankTransferPaymentDto,
  CreateWithdrawalRequestDto,
} from '../dtos/wallet.dto';
import { MonthlyStatementQueryDto } from '../dtos/financial-statement.dto';
import { PaginationParamsDto } from '../../../common/dtos/pagination.dto';

@ApiTags('Merchant Wallet & Transactions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('api/wallet')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly bankTransferPaymentService: BankTransferPaymentService,
    private readonly withdrawalRequestService: WithdrawalRequestService,
    private readonly financialStatementService: FinancialStatementService,
    private readonly storageService: StorageService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get wallet balance, reserved funds & recent history' })
  async getWalletDashboard(@CurrentUser('id') merchantId: string) {
    return this.walletService.getWalletDashboard(merchantId);
  }

  @Get('balance-audit')
  @ApiOperation({
    summary:
      'Ledger Audit: Verify stored wallet balance against the sum of completed ledger transactions',
  })
  async auditWalletBalance(@CurrentUser('id') merchantId: string) {
    return this.walletService.auditWalletAgainstLedger(merchantId);
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
    return this.bankTransferPaymentService.createBankTransfer(merchantId, dto);
  }

  @Post('bank-transfers/with-receipt')
  @ApiOperation({
    summary: 'Submit manual bank transfer and upload receipt image in a single request',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', example: 1000.0 },
        bankAccountId: { type: 'string', example: 'a1b2c3d4-e5f6-7890-abcd-1234567890ab' },
        receiptFile: {
          type: 'string',
          format: 'binary',
          description: 'Receipt image or document (JPEG, PNG, PDF max 10MB)',
        },
      },
      required: ['amount', 'bankAccountId', 'receiptFile'],
    },
  })
  @UseInterceptors(FileInterceptor('receiptFile'))
  async createBankTransferWithReceipt(
    @CurrentUser('id') merchantId: string,
    @Body() dto: CreateBankTransferPaymentDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 })], // 10MB
        fileIsRequired: true,
      }),
    )
    receiptFile: Express.Multer.File,
    @Req() req: Request,
  ) {
    // 1. Create the bank transfer entity record
    const payment = await this.bankTransferPaymentService.createBankTransfer(merchantId, dto);

    // 2. Upload and attach the receipt with polymorphic entity tracking
    const attachment = await this.storageService.handleFileUpload(
      receiptFile,
      req,
      {
        entityType: 'BankTransferPayment',
        entityId: payment.id,
        tag: 'receipt',
      },
      merchantId,
    );

    // 3. Store the direct receipt URL on the payment record for instant read access
    const updatedPayment = await this.bankTransferPaymentService.updateReceiptUrl(
      payment.id,
      attachment.url,
      merchantId,
    );

    return {
      message: 'Bank transfer submitted with receipt successfully',
      payment: updatedPayment,
      attachment,
    };
  }

  @Post('bank-transfers/:id/receipt')
  @ApiOperation({ summary: 'Upload or update receipt for an existing bank transfer' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadReceiptForTransfer(
    @CurrentUser('id') merchantId: string,
    @Param('id') transferId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 })],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
    @Req() req: Request,
  ) {
    // Verify ownership
    await this.bankTransferPaymentService.getBankTransferById(transferId, merchantId);

    // Save attachment
    const attachment = await this.storageService.handleFileUpload(
      file,
      req,
      {
        entityType: 'BankTransferPayment',
        entityId: transferId,
        tag: 'receipt',
      },
      merchantId,
    );

    // Update payment
    const updated = await this.bankTransferPaymentService.updateReceiptUrl(
      transferId,
      attachment.url,
      merchantId,
    );

    return {
      message: 'Receipt uploaded successfully',
      payment: updated,
      attachment,
    };
  }

  @Get('bank-transfers')
  @ApiOperation({ summary: 'List merchant submitted bank transfers' })
  async getMyBankTransfers(@CurrentUser('id') merchantId: string) {
    return this.bankTransferPaymentService.getMerchantBankTransfers(merchantId);
  }

  // --- Withdrawal Requests ---
  @Post('withdrawals')
  @ApiOperation({ summary: 'Submit a new withdrawal request to transfer wallet funds to bank account' })
  async createWithdrawalRequest(
    @CurrentUser('id') merchantId: string,
    @Body() dto: CreateWithdrawalRequestDto,
  ) {
    return this.withdrawalRequestService.createWithdrawalRequest(merchantId, dto);
  }

  @Get('withdrawals')
  @ApiOperation({ summary: 'List merchant withdrawal request history' })
  async getMyWithdrawalRequests(@CurrentUser('id') merchantId: string) {
    return this.withdrawalRequestService.getMerchantWithdrawalRequests(merchantId);
  }

  @Get('withdrawals/:id')
  @ApiOperation({ summary: 'Get details of a specific withdrawal request' })
  async getWithdrawalRequestById(
    @CurrentUser('id') merchantId: string,
    @Param('id') id: string,
  ) {
    return this.withdrawalRequestService.getWithdrawalRequestById(id, merchantId);
  }

  // ==========================================
  // MERCHANT MONTHLY FINANCIAL STATEMENTS
  // ==========================================

  @Get('statements/monthly')
  @ApiOperation({
    summary:
      'Merchant Monthly Financial Statements: JSON view of monthly invoice summary, shipping fees, and ZATCA tax report',
  })
  async getMonthlyStatement(
    @CurrentUser('id') merchantId: string,
    @Query() query: MonthlyStatementQueryDto,
  ) {
    return this.financialStatementService.getMonthlyStatementData(
      merchantId,
      query.month,
    );
  }

  @Get('statements/monthly/csv')
  @ApiOperation({
    summary:
      'Merchant Monthly Financial Statements: Direct CSV export download of monthly invoice, shipping fees & tax report',
  })
  @ApiProduces('text/csv')
  async exportMonthlyStatementCsv(
    @CurrentUser('id') merchantId: string,
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

    // Return with UTF-8 BOM for immediate Microsoft Excel & Numbers compatibility
    return res.status(200).send(`\uFEFF${result.csvContent}`);
  }

  @Get('statements/monthly/pdf')
  @ApiOperation({
    summary:
      'Merchant Monthly Financial Statements: Direct PDF export download of monthly invoice, shipping fees & ZATCA tax report',
  })
  @ApiProduces('application/pdf')
  async exportMonthlyStatementPdf(
    @CurrentUser('id') merchantId: string,
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
