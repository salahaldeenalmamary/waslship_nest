import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaymentMethod } from '../enums/shipment.enum';

export class AdminCreateShipmentDto {
  @ApiProperty({
    example: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    description:
      'Merchant / User ID on whose behalf the admin is creating the shipment',
  })
  @IsNotEmpty()
  @IsString()
  merchantId: string;

  @ApiProperty({
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    description:
      'UserAddress ID for sender / pickup location (must belong to the selected merchant)',
  })
  @IsNotEmpty()
  @IsString()
  pickupAddressId: string;

  @ApiProperty({
    example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    description:
      'UserAddress ID for recipient / delivery destination (must belong to the selected merchant)',
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
    description:
      'Optional OTO Delivery Option ID to automatically finalize carrier booking in one step',
  })
  @IsOptional()
  deliveryOptionId?: string | number;

  @ApiPropertyOptional({
    example: 'Admin created with express priority handling',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
