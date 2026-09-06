import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class MonthlyStatementQueryDto {
  @ApiPropertyOptional({
    example: '2026-09',
    description: 'Target billing month in YYYY-MM format. Defaults to current month.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must be in YYYY-MM format (e.g. 2026-09)',
  })
  month?: string;

  @ApiPropertyOptional({
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    description: 'Merchant ID (Only allowed for Admin)',
  })
  @IsOptional()
  @IsString()
  merchantId?: string;
}
