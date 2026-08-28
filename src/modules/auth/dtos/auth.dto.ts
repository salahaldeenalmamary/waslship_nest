import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'merchant@waslship.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+966500000001' })
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: 'SuperSecurePass123!' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'Ahmed Al-Shehri' })
  @IsNotEmpty()
  fullName: string;

  @ApiPropertyOptional({ example: 'Wasl Logistics Store' })
  @IsOptional()
  @IsString()
  companyName?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'merchant@waslship.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SuperSecurePass123!' })
  @IsString()
  password: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '+966500000001' })
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty()
  otpCode: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'merchant@waslship.com' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'merchant@waslship.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty()
  otpCode: string;

  @ApiProperty({ example: 'NewSecurePass123!' })
  @IsString()
  @MinLength(6)
  newPassword: string;
}
