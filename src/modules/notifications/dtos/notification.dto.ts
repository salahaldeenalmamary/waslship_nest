import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DevicePlatform, NotificationType } from '../enums/notification.enum';

export class RegisterDeviceTokenDto {
  @ApiProperty({ example: 'fcm-device-token-sample-123456' })
  @IsNotEmpty()
  @IsString()
  token: string;

  @ApiProperty({ enum: DevicePlatform, default: DevicePlatform.Web })
  @IsEnum(DevicePlatform)
  platform: DevicePlatform;
}

export class SendPushNotificationDto {
  @ApiProperty({ example: 'user-uuid' })
  @IsNotEmpty()
  @IsString()
  userId: string;

  @ApiProperty({ example: 'Delivery Arrived' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({ example: 'Your package #WSL12345678 has been delivered.' })
  @IsNotEmpty()
  @IsString()
  body: string;

  @ApiPropertyOptional({ enum: NotificationType, default: NotificationType.General })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType = NotificationType.General;

  @ApiPropertyOptional()
  @IsOptional()
  data?: any;
}
