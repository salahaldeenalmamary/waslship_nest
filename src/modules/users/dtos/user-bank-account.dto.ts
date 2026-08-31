import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateUserBankAccountDto {
  @ApiProperty({ example: 'Al Rajhi Bank' })
  @IsNotEmpty()
  @IsString()
  bankName: string;

  @ApiProperty({ example: 'Ahmed Al-Shehri' })
  @IsNotEmpty()
  @IsString()
  accountHolderName: string;

  @ApiProperty({ example: '1234567890' })
  @IsNotEmpty()
  @IsString()
  accountNumber: string;

  @ApiProperty({ example: 'SA0380000000123456789012' })
  @IsNotEmpty()
  @IsString()
  iban: string;

  @ApiPropertyOptional({ example: 'RJHI2022' })
  @IsOptional()
  @IsString()
  swiftCode?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateUserBankAccountDto {
  @ApiPropertyOptional({ example: 'Al Rajhi Bank' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ example: 'Ahmed Al-Shehri' })
  @IsOptional()
  @IsString()
  accountHolderName?: string;

  @ApiPropertyOptional({ example: '1234567890' })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({ example: 'SA0380000000123456789012' })
  @IsOptional()
  @IsString()
  iban?: string;

  @ApiPropertyOptional({ example: 'RJHI2022' })
  @IsOptional()
  @IsString()
  swiftCode?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
