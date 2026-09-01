import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaymentMethod } from '../enums/shipment.enum';

export class DeliveryFeeCheckDto {
  @ApiProperty({ example: 'Riyadh' })
  @IsNotEmpty()
  pickupCity: string;

  @ApiProperty({ example: 'Jeddah' })
  @IsNotEmpty()
  deliveryCity: string;

  @ApiPropertyOptional({ example: 2.0, default: 1.0 })
  @IsOptional()
  @IsNumber()
  weightKg?: number = 1.0;

  @ApiPropertyOptional({ example: PaymentMethod.COD, enum: PaymentMethod })
  @IsOptional()
  paymentMethod?: PaymentMethod = PaymentMethod.COD;

  @ApiPropertyOptional({ example: 150.0 })
  @IsOptional()
  @IsNumber()
  codAmount?: number = 0;
}

export class CreateOtoShipmentDto {
  @ApiProperty({
    example: 'ORD-100234',
    description: 'OTO Order ID or internal Shipment ID',
  })
  @IsNotEmpty()
  @IsString()
  orderId: string;

  @ApiPropertyOptional({
    example: '101',
    description: 'Selected delivery option ID from getDeliveryFee',
  })
  @IsOptional()
  deliveryOptionId?: string | number;
}

export class SelectDeliveryOptionDto {
  @ApiProperty({
    example: '101',
    description: 'Selected delivery option ID from OTO getDeliveryFee response',
  })
  @IsNotEmpty()
  deliveryOptionId: string | number;
}

export class GetOtoDeliveryFeeDto {
  @ApiProperty({
    example: 'ORD-100234',
    description: 'OTO Order ID or internal Shipment ID',
  })
  @IsNotEmpty()
  @IsString()
  orderId: string;
}

export class PrepareOtoPayloadDto {
  @ApiProperty({
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    description: 'UserAddress ID for pickup / sender location',
  })
  @IsNotEmpty()
  @IsString()
  pickupAddressId: string;

  @ApiProperty({
    example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    description: 'UserAddress ID for delivery / recipient destination',
  })
  @IsNotEmpty()
  @IsString()
  deliveryAddressId: string;

  @ApiPropertyOptional({ example: 'ORD-100234' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({ example: 101 })
  @IsOptional()
  deliveryOptionId?: string | number;

  @ApiPropertyOptional({ example: 2.5, default: 1 })
  @IsOptional()
  @IsNumber()
  weightKg?: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  piecesCount?: number;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.Prepaid })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsNumber()
  codAmount?: number;
}
