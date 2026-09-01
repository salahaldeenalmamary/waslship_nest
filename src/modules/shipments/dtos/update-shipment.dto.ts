import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ShipmentStatus } from '../enums/shipment.enum';

export class UpdateShipmentStatusDto {
  @ApiProperty({ enum: ShipmentStatus })
  @IsEnum(ShipmentStatus)
  status: ShipmentStatus;

  @ApiPropertyOptional({ example: 'Out for delivery with driver' })
  @IsOptional()
  notes?: string;
}

export class UpdateCarrierDetailsDto {
  @ApiPropertyOptional({ example: 'SMSA Express' })
  @IsOptional()
  @IsString()
  carrierName?: string;

  @ApiPropertyOptional({ example: 'https://smsaexpress.com/track/123456' })
  @IsOptional()
  @IsString()
  carrierTrackingUrl?: string;

  @ApiPropertyOptional({ example: 'OTO-99281' })
  @IsOptional()
  @IsString()
  otoOrderId?: string;

  @ApiPropertyOptional({ example: 25.5 })
  @IsOptional()
  @IsNumber()
  otoDeliveryFee?: number;
}

export class AdminCancelShipmentDto {
  @ApiProperty({ example: 'Address out of delivery zone' })
  @IsNotEmpty()
  @IsString()
  reason: string;
}

export class BulkUpdateShipmentStatusDto {
  @ApiProperty({ example: ['uuid1', 'uuid2'] })
  @IsNotEmpty()
  shipmentIds: string[];

  @ApiProperty({ enum: ShipmentStatus })
  @IsEnum(ShipmentStatus)
  status: ShipmentStatus;

  @ApiPropertyOptional({ example: 'Bulk status update by admin' })
  @IsOptional()
  @IsString()
  notes?: string;
}
