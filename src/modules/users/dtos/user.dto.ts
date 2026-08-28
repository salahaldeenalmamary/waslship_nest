import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { AddressType, UserRole } from '../enums/user.enum';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Ahmed Al-Shehri' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ example: 'Wasl Logistics Store Updated' })
  @IsOptional()
  @IsString()
  companyName?: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'SuperSecurePass123!' })
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ example: 'BrandNewPass2026!' })
  @IsNotEmpty()
  newPassword: string;
}

export class CreateUserAddressDto {
  @ApiProperty({ example: 'Main Riyadh Warehouse' })
  @IsNotEmpty()
  title: string;

  @ApiProperty({ enum: AddressType, default: AddressType.Both })
  @IsEnum(AddressType)
  type: AddressType;

  @ApiProperty({ example: 'Ahmed Al-Shehri' })
  @IsNotEmpty()
  contactName: string;

  @ApiProperty({ example: '+966500000001' })
  @IsNotEmpty()
  contactPhone: string;

  @ApiProperty({ example: 'Saudi Arabia', default: 'Saudi Arabia' })
  @IsNotEmpty()
  country: string;

  @ApiProperty({ example: 'Riyadh' })
  @IsNotEmpty()
  city: string;

  @ApiPropertyOptional({ example: 'Al Olaya' })
  @IsOptional()
  district?: string;

  @ApiProperty({ example: 'King Fahd Road, Building 402' })
  @IsNotEmpty()
  street: string;

  @ApiPropertyOptional({ example: '402' })
  @IsOptional()
  buildingNumber?: string;

  @ApiPropertyOptional({ example: '12214' })
  @IsOptional()
  postalCode?: string;

  @ApiPropertyOptional({ example: 24.7136 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 46.6753 })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateUserAddressDto extends CreateUserAddressDto {}

export class UpdateUserStatusDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;
}

export class CreateAdminDto {
  @ApiProperty({ example: 'admin@waslship.com' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '+966599999999' })
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: 'Wasl Admin Officer' })
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ example: 'AdminPass123!' })
  @IsNotEmpty()
  password: string;

  @ApiProperty({ enum: UserRole, default: UserRole.Admin })
  @IsEnum(UserRole)
  role: UserRole;
}
