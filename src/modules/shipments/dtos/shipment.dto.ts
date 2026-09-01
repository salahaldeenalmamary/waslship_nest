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
import { PaymentMethod, ShipmentStatus } from '../enums/shipment.enum';

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

export class UpdateShipmentStatusDto {
  @ApiProperty({ enum: ShipmentStatus })
  @IsEnum(ShipmentStatus)
  status: ShipmentStatus;

  @ApiPropertyOptional({ example: 'Out for delivery with driver' })
  @IsOptional()
  notes?: string;
}

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

export class CreateOtoShipmentDto {
  @ApiProperty({ example: 'ORD-100234', description: 'OTO Order ID or internal Shipment ID' })
  @IsNotEmpty()
  @IsString()
  orderId: string;

  @ApiPropertyOptional({ example: '101', description: 'Selected delivery option ID from getDeliveryFee' })
  @IsOptional()
  deliveryOptionId?: string | number;
}

export class SelectDeliveryOptionDto {
  @ApiProperty({ example: '101', description: 'Selected delivery option ID from OTO getDeliveryFee response' })
  @IsNotEmpty()
  deliveryOptionId: string | number;
}

export class GetOtoDeliveryFeeDto {
  @ApiProperty({ example: 'ORD-100234', description: 'OTO Order ID or internal Shipment ID' })
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

export class AdminCreateShipmentDto {
  @ApiProperty({
    example: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    description: 'Merchant / User ID on whose behalf the admin is creating the shipment',
  })
  @IsNotEmpty()
  @IsString()
  merchantId: string;

  @ApiProperty({
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    description: 'UserAddress ID for sender / pickup location (must belong to the selected merchant)',
  })
  @IsNotEmpty()
  @IsString()
  pickupAddressId: string;

  @ApiProperty({
    example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    description: 'UserAddress ID for recipient / delivery destination (must belong to the selected merchant)',
  })
  @IsNotEmpty()
  @IsString()
  deliveryAddressId: string;

  @ApiPropertyOptional({ example: 1.5, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  weightKg?: number = 1;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  piecesCount?: number = 1;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.Prepaid })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod = PaymentMethod.Prepaid;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  codAmount?: number = 0;

  @ApiPropertyOptional({ example: 'Wholesale order shipment' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 350.0 })
  @IsOptional()
  @IsNumber()
  declaredValue?: number;

  @ApiPropertyOptional({
    example: 101,
    description: 'Optional OTO Delivery Option ID to automatically finalize carrier booking in one step',
  })
  @IsOptional()
  deliveryOptionId?: string | number;

  @ApiPropertyOptional({ example: 'Admin created with express priority handling' })
  @IsOptional()
  @IsString()
  notes?: string;
}


