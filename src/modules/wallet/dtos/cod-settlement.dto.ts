import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ReconcileCodReceiptItemDto {
  @ApiProperty({ example: 'WSL-1725619200-1234' })
  @IsNotEmpty()
  @IsString()
  trackingNumber: string;

  @ApiProperty({ example: 150.0, description: 'Actual COD collected by courier' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  collectedAmount: number;

  @ApiPropertyOptional({ example: 'OTO' })
  @IsOptional()
  @IsString()
  carrierCode?: string;

  @ApiPropertyOptional({ example: 'REC-OTO-892102' })
  @IsOptional()
  @IsString()
  carrierReceiptReference?: string;

  @ApiPropertyOptional({ example: '2026-09-06T12:00:00Z' })
  @IsOptional()
  @IsString()
  deliveryDate?: string;

  @ApiPropertyOptional({ example: 'Delivered to customer doorstep' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReconcileCodBatchDto {
  @ApiPropertyOptional({ example: 'OTO', default: 'OTO' })
  @IsOptional()
  @IsString()
  carrierCode?: string = 'OTO';

  @ApiPropertyOptional({ example: 'REMIT-20260906-001' })
  @IsOptional()
  @IsString()
  batchReference?: string;

  @ApiProperty({ type: [ReconcileCodReceiptItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReconcileCodReceiptItemDto)
  receipts: ReconcileCodReceiptItemDto[];

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'If true, updates shipment status to Delivered if not already marked',
  })
  @IsOptional()
  @IsBoolean()
  autoDeliverShipments?: boolean = true;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'If true, automatically deducts shippingCost from collected COD to credit net balance',
  })
  @IsOptional()
  @IsBoolean()
  deductShippingFees?: boolean = true;

  @ApiPropertyOptional({ example: 'Automated daily courier remittance' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AutoReconcileDeliveredShipmentsDto {
  @ApiPropertyOptional({ example: 'OTO' })
  @IsOptional()
  @IsString()
  carrierCode?: string;

  @ApiPropertyOptional({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsOptional()
  @IsString()
  merchantId?: string;

  @ApiPropertyOptional({ example: 100, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 100;
}

export class SimulateOtoWebhookDeliveryDto {
  @ApiProperty({ example: 'WSL12345678', description: 'Tracking number of the COD shipment' })
  @IsNotEmpty()
  @IsString()
  trackingNumber: string;

  @ApiPropertyOptional({ example: 'OTO-987654321' })
  @IsOptional()
  @IsString()
  otoOrderId?: string;

  @ApiPropertyOptional({
    example: 'delivered',
    description: 'Status sent by OTO webhook (e.g., delivered, cash_collected, completed)',
    default: 'delivered',
  })
  @IsOptional()
  @IsString()
  status?: string = 'delivered';

  @ApiPropertyOptional({
    example: 150.0,
    description: 'Actual COD cash amount collected by carrier (defaults to shipment codAmount if omitted)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  collectedAmount?: number;

  @ApiPropertyOptional({ example: 'OTO / Aramex Express' })
  @IsOptional()
  @IsString()
  carrierName?: string;

  @ApiPropertyOptional({ example: 'REC-OTO-992182' })
  @IsOptional()
  @IsString()
  carrierReceiptReference?: string;

  @ApiPropertyOptional({ example: 'Customer paid in cash upon delivery' })
  @IsOptional()
  @IsString()
  notes?: string;
}

