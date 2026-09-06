import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ImportShipmentsCsvDto {
  @ApiPropertyOptional({
    example:
      'Recipient Name,Recipient Phone,Recipient City,Recipient Street,Recipient District,Pickup Address ID,Payment Method,COD Amount,Weight (kg),Pieces,Package Description,Preferred Carrier\n' +
      'Sultan Al-Otaibi,+966501234567,Jeddah,King Fahd Road,Al-Safa,a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11,COD,150,1.5,1,Electronics - Smart Watch,SMSA\n' +
      'Noura Al-Ghamdi,+966559876543,Dammam,Prince Mohammad St,Al-Shati,a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11,PREPAID,0,2.0,1,Clothing & Apparel,ARAMEX',
    description: 'Raw CSV content text to parse and import',
  })
  @IsOptional()
  @IsString()
  csvContent?: string;

  @ApiPropertyOptional({
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    description:
      'Default pickup address ID to use if row does not specify a Pickup Address ID',
  })
  @IsOptional()
  @IsString()
  defaultPickupAddressId?: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description:
      'Whether to automatically create and register shipments with carriers upon validation',
  })
  @IsOptional()
  @IsBoolean()
  autoBook?: boolean = true;
}

export class CsvRowValidationError {
  rowNumber: number;
  rowData: Record<string, string>;
  errors: string[];
}

export class BatchImportResultDto {
  totalRowsProcessed: number;
  successfulCount: number;
  failedCount: number;
  createdShipmentsCount: number;
  createdShipments: any[];
  errors: CsvRowValidationError[];
  summaryMessage: string;
}
