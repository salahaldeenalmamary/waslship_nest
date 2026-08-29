import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { BankTransferStatus, TransactionType } from '../enums/wallet.enum';

export class InitiateDepositDto {
  @ApiProperty({ example: 200.0 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: 'Visa', default: 'CreditCard' })
  @IsOptional()
  paymentMethod?: string = 'CreditCard';
}

export class CreateBankTransferPaymentDto {
  @ApiProperty({ example: 1000.0 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ example: 'Al Rajhi Bank' })
  @IsNotEmpty()
  bankName: string;

  @ApiProperty({ example: 'Wasl Logistics Store LLC' })
  @IsNotEmpty()
  accountHolderName: string;

  @ApiProperty({ example: '12345678901234' })
  @IsNotEmpty()
  accountNumber: string;

  @ApiPropertyOptional({ example: 'SA0380000000608010167519' })
  @IsOptional()
  iban?: string;

  @ApiPropertyOptional({ example: 'https://storage.waslship.com/receipts/rec-123.jpg' })
  @IsOptional()
  receiptUrl?: string;
}

export class ReviewBankTransferDto {
  @ApiProperty({ enum: BankTransferStatus })
  @IsEnum(BankTransferStatus)
  status: BankTransferStatus;

  @ApiPropertyOptional({ example: 'Payment verified and credited to wallet.' })
  @IsOptional()
  adminNotes?: string;
}
