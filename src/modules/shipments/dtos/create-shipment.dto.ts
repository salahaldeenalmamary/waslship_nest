import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { PaymentMethod } from '../enums/shipment.enum';

export class CreateShipmentDto {
  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.COD })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod = PaymentMethod.COD;

  @ApiPropertyOptional({ example: 150.0, description: 'COD amount to collect' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  codAmount?: number = 0;

  @ApiProperty({
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    description: 'UserAddress ID for sender / pickup location',
  })
  @IsNotEmpty()
  @IsString()
  pickupAddressId: string;

  @ApiProperty({
    example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    description: 'UserAddress ID for recipient / delivery destination',
  })
  @IsNotEmpty()
  @IsString()
  deliveryAddressId: string;

  @ApiPropertyOptional({ example: 1.5, default: 1 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  weightKg?: number = 1.0;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  piecesCount?: number = 1;

  @ApiPropertyOptional({ example: 'Electronics - Smartphone case & cable' })
  @IsOptional()
  packageDescription?: string;

  @ApiPropertyOptional({ example: 'Deliver after 4 PM' })
  @IsOptional()
  notes?: string;
}

export class BulkCreateOrderDto {
  @ApiProperty({ type: [CreateShipmentDto] })
  orders: CreateShipmentDto[];
}
