import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class EstimateShipmentRateDto {
  @ApiProperty({
    example: 'Riyadh',
    description: 'City where shipment will be picked up from',
  })
  @IsNotEmpty()
  @IsString()
  pickupCity: string;

  @ApiProperty({
    example: 'Jeddah',
    description: 'Destination city where shipment will be delivered',
  })
  @IsNotEmpty()
  @IsString()
  deliveryCity: string;

  @ApiPropertyOptional({
    example: 1.5,
    default: 1,
    description: 'Package weight in KG',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  weightKg?: number = 1.0;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Number of pieces/parcels',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  piecesCount?: number = 1;

  @ApiPropertyOptional({
    example: 150.0,
    default: 0,
    description: 'Cash-on-Delivery amount (SAR)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  codAmount?: number = 0;

  @ApiPropertyOptional({
    example: 250.0,
    description: 'Declared goods value for insurance/customs (SAR)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  declaredValue?: number;

  @ApiPropertyOptional({
    example: 'OTO',
    description: 'Target carrier code (OTO)',
  })
  @IsOptional()
  @IsString()
  carrierCode?: string = 'OTO';
}
