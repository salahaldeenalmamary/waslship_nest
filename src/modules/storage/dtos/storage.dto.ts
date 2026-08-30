import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { PaginationParamsDto } from '../../../common/dtos/pagination.dto';

export class UploadMediaOptionsDto {
  @ApiPropertyOptional({
    description: 'Entity model name to attach media to (e.g. Shipment, User, BankTransferPayment)',
    example: 'Shipment',
  })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({
    description: 'Target Entity UUID or ID',
    example: 'd3b07384-d113-460b-93ae-c79a4da9001b',
  })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({
    description: 'Semantic tag / purpose of the file (e.g. receipt, avatar, proof_of_delivery, label)',
    example: 'receipt',
  })
  @IsOptional()
  @IsString()
  tag?: string;
}

export class AttachMediaDto {
  @ApiProperty({
    description: 'Target Entity Type / Model name (e.g. Shipment, User, BankTransferPayment)',
    example: 'Shipment',
  })
  @IsNotEmpty()
  @IsString()
  entityType: string;

  @ApiProperty({
    description: 'Target Entity ID / UUID',
    example: 'd3b07384-d113-460b-93ae-c79a4da9001b',
  })
  @IsNotEmpty()
  @IsString()
  entityId: string;

  @ApiPropertyOptional({
    description: 'Optional semantic tag (e.g. proof_of_delivery, receipt, avatar)',
    example: 'proof_of_delivery',
  })
  @IsOptional()
  @IsString()
  tag?: string;
}

export class QueryMediaAttachmentsDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    description: 'Filter by entity type (e.g. Shipment, User, BankTransferPayment)',
    example: 'Shipment',
  })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({
    description: 'Filter by entity ID',
    example: 'd3b07384-d113-460b-93ae-c79a4da9001b',
  })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({
    description: 'Filter by tag (e.g. receipt, avatar)',
    example: 'receipt',
  })
  @IsOptional()
  @IsString()
  tag?: string;
}
