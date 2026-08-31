import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: 'Visa', default: 'CreditCard' })
  @IsOptional()
  paymentMethod?: string = 'CreditCard';
}

export class CreateBankAccountDto {
  @ApiProperty({ example: 'Al Rajhi Bank' })
  @IsNotEmpty()
  @IsString()
  bankName: string;

  @ApiProperty({ example: 'Wasl Logistics Store LLC' })
  @IsNotEmpty()
  @IsString()
  accountHolderName: string;

  @ApiProperty({ example: '12345678901234' })
  @IsNotEmpty()
  @IsString()
  accountNumber: string;

  @ApiPropertyOptional({ example: 'SA0380000000608010167519' })
  @IsOptional()
  @IsString()
  iban?: string;
}

export class UpdateBankAccountDto {
  @ApiPropertyOptional({ example: 'Al Rajhi Bank' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ example: 'Wasl Logistics Store LLC' })
  @IsOptional()
  @IsString()
  accountHolderName?: string;

  @ApiPropertyOptional({ example: '12345678901234' })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({ example: 'SA0380000000608010167519' })
  @IsOptional()
  @IsString()
  iban?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isActive?: boolean;
}

export class CreateBankTransferPaymentDto {
  @ApiProperty({ example: 1000.0 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-1234567890ab' })
  @IsNotEmpty()
  @IsString()
  bankAccountId: string;

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
