import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shipment } from '../entities/shipment.entity';
import { UserAddress } from '../../users/entities/user-address.entity';
import { PaymentMethod, ShipmentStatus } from '../enums/shipment.enum';
import { ImportShipmentsCsvDto, BatchImportResultDto, CsvRowValidationError } from '../dtos/import-csv.dto';
import { ShipmentsService } from './shipments.service';
import { MultiCarrierRegistryService } from './carriers/multi-carrier-registry.service';

@Injectable()
export class ShipmentBatchImporterService {
  private readonly logger = new Logger(ShipmentBatchImporterService.name);

  constructor(
    @InjectRepository(Shipment)
    private readonly shipmentRepository: Repository<Shipment>,
    @InjectRepository(UserAddress)
    private readonly addressRepository: Repository<UserAddress>,
    private readonly shipmentsService: ShipmentsService,
    private readonly carrierRegistry: MultiCarrierRegistryService,
  ) {}

  /**
   * Return a ready-to-use CSV template sample
   */
  getSampleCsvTemplate(): {
    filename: string;
    csvContent: string;
    headers: string[];
  } {
    const headers = [
      'Recipient Name',
      'Recipient Phone',
      'Recipient City',
      'Recipient Street',
      'Recipient District',
      'Pickup Address ID',
      'Payment Method',
      'COD Amount',
      'Weight (kg)',
      'Pieces',
      'Package Description',
      'Preferred Carrier',
    ];

    const sampleRows = [
      'Sultan Al-Otaibi,+966501234567,Jeddah,King Fahd Road,Al-Safa,a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11,COD,150,1.5,1,Electronics - Smart Watch,OTO',
      'Noura Al-Ghamdi,+966559876543,Dammam,Prince Mohammad St,Al-Shati,a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11,PREPAID,0,2.0,1,Clothing & Apparel,OTO',
      'Tariq Al-Harbi,+966541122334,Riyadh,Olaya Street,Al-Worood,a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11,COD,299.50,0.8,1,Perfumes & Cosmetics,OTO',
    ];

    return {
      filename: 'waslship_bulk_import_template.csv',
      csvContent: `${headers.join(',')}\n${sampleRows.join('\n')}`,
      headers,
    };
  }

  /**
   * Parse CSV string into array of object rows
   */
  private parseCsvString(csvText: string): Array<Record<string, string>> {
    if (!csvText || !csvText.trim()) return [];

    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) return [];

    // Parse header row
    const headers = this.parseCsvLine(lines[0]).map((h) =>
      h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''),
    );

    const rows: Array<Record<string, string>> = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      if (values.length === 0) continue;

      const rowObj: Record<string, string> = {};
      headers.forEach((header, idx) => {
        rowObj[header] = values[idx] ? values[idx].trim() : '';
      });
      rows.push(rowObj);
    }

    return rows;
  }

  /**
   * Custom robust CSV line splitter respecting quotes
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if ((char === ',' || char === ';') && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result.map((s) => s.replace(/^"|"$/g, '').trim());
  }

  /**
   * Process and import batch shipments from CSV
   */
  async processBatchImport(
    merchantId: string,
    dto: ImportShipmentsCsvDto,
  ): Promise<BatchImportResultDto> {
    if (!dto.csvContent || !dto.csvContent.trim()) {
      throw new BadRequestException('CSV content is empty or invalid.');
    }

    const rawRows = this.parseCsvString(dto.csvContent);

    if (rawRows.length === 0) {
      throw new BadRequestException(
        'No valid data rows found in CSV. Please verify file header structure.',
      );
    }

    // Resolve default pickup address if needed
    let defaultPickupAddress: UserAddress | null = null;
    if (dto.defaultPickupAddressId) {
      defaultPickupAddress = await this.addressRepository.findOne({
        where: { id: dto.defaultPickupAddressId, userId: merchantId },
      });
    }

    if (!defaultPickupAddress) {
      // Find merchant's first address as fallback default
      defaultPickupAddress = await this.addressRepository.findOne({
        where: { userId: merchantId },
      });
    }

    const validationErrors: CsvRowValidationError[] = [];
    const validRowsToCreate: Array<{
      rowNumber: number;
      recipientName: string;
      recipientPhone: string;
      recipientCity: string;
      recipientStreet: string;
      recipientDistrict?: string;
      pickupAddressId: string;
      paymentMethod: PaymentMethod;
      codAmount: number;
      weightKg: number;
      piecesCount: number;
      packageDescription?: string;
      preferredCarrier?: string;
      rawData: Record<string, string>;
    }> = [];

    // Validate each row
    for (let idx = 0; idx < rawRows.length; idx++) {
      const row = rawRows[idx];
      const rowNum = idx + 2; // Row 1 is header
      const rowErrors: string[] = [];

      // Extract field values using normalized header names
      const recipientName =
        row['recipientname'] || row['name'] || row['recipient'];
      const recipientPhone =
        row['recipientphone'] || row['phone'] || row['mobile'];
      const recipientCity = row['recipientcity'] || row['city'];
      const recipientStreet =
        row['recipientstreet'] || row['street'] || row['address'];
      const recipientDistrict = row['recipientdistrict'] || row['district'];

      const pickupAddrId =
        row['pickupaddressid'] ||
        row['pickupid'] ||
        defaultPickupAddress?.id;

      const rawPayment = (
        row['paymentmethod'] ||
        row['payment'] ||
        'COD'
      ).toUpperCase();

      const rawCod = row['codamount'] || row['cod'] || '0';
      const rawWeight = row['weightkg'] || row['weight'] || '1.0';
      const rawPieces = row['pieces'] || row['piecescount'] || '1';
      const packageDescription =
        row['packagedescription'] || row['description'] || row['details'];
      const preferredCarrier = (
        row['preferredcarrier'] ||
        row['carrier'] ||
        'OTO'
      ).toUpperCase();

      // Validation Checks
      if (!recipientName) rowErrors.push('Recipient Name is required.');
      if (!recipientPhone) {
        rowErrors.push('Recipient Phone is required.');
      } else if (!/^[+0-9\s-]{8,15}$/.test(recipientPhone)) {
        rowErrors.push(
          `Invalid phone number format '${recipientPhone}'. Must be valid phone number.`,
        );
      }

      if (!recipientCity) rowErrors.push('Recipient City is required.');
      if (!recipientStreet) rowErrors.push('Recipient Street is required.');

      if (!pickupAddrId) {
        rowErrors.push(
          'Pickup Address ID is required or a default merchant pickup address must be provided.',
        );
      }

      let paymentMethod = PaymentMethod.COD;
      if (rawPayment === 'PREPAID' || rawPayment === 'CARD') {
        paymentMethod = PaymentMethod.Prepaid;
      } else if (rawPayment !== 'COD') {
        rowErrors.push(
          `Invalid payment method '${rawPayment}'. Must be 'COD' or 'PREPAID'.`,
        );
      }

      const codAmount = parseFloat(rawCod);
      if (isNaN(codAmount) || codAmount < 0) {
        rowErrors.push(`Invalid COD Amount '${rawCod}'. Must be a non-negative number.`);
      }

      const weightKg = parseFloat(rawWeight);
      if (isNaN(weightKg) || weightKg <= 0) {
        rowErrors.push(`Invalid Weight '${rawWeight}'. Must be a positive number in KG.`);
      }

      const piecesCount = parseInt(rawPieces, 10);
      if (isNaN(piecesCount) || piecesCount < 1) {
        rowErrors.push(`Invalid Pieces count '${rawPieces}'. Must be an integer >= 1.`);
      }

      if (preferredCarrier && preferredCarrier !== 'OTO') {
        rowErrors.push(
          `Invalid Carrier code '${preferredCarrier}'. Only direct OTO carrier is supported.`,
        );
      }

      if (rowErrors.length > 0) {
        validationErrors.push({
          rowNumber: rowNum,
          rowData: row,
          errors: rowErrors,
        });
      } else {
        validRowsToCreate.push({
          rowNumber: rowNum,
          recipientName,
          recipientPhone,
          recipientCity,
          recipientStreet,
          recipientDistrict,
          pickupAddressId: pickupAddrId!,
          paymentMethod,
          codAmount,
          weightKg,
          piecesCount,
          packageDescription,
          preferredCarrier: 'OTO',
          rawData: row,
        });
      }
    }

    // Create shipments for all valid rows
    const createdShipments: Shipment[] = [];

    for (const validItem of validRowsToCreate) {
      try {
        // Create delivery address object for recipient
        const deliveryAddress: UserAddress = await this.addressRepository.save(
          this.addressRepository.create({
            userId: merchantId,
            title: `Delivery - ${validItem.recipientName}`,
            contactName: validItem.recipientName,
            contactPhone: validItem.recipientPhone,
            city: validItem.recipientCity,
            street: validItem.recipientStreet,
            district: validItem.recipientDistrict || undefined,
            country: 'Saudi Arabia',
            isDefault: false,
            type: 'Delivery',
          }),
        );

        // Calculate rate estimation for OTO carrier
        const rateEstimate = await this.carrierRegistry.estimateShippingRates(
          {
            pickupCity: 'Riyadh', // Default origin if address not loaded
            deliveryCity: validItem.recipientCity,
            weightKg: validItem.weightKg,
            piecesCount: validItem.piecesCount,
            codAmount: validItem.codAmount,
          },
          'OTO',
        );

        const chosenCarrierCode = 'OTO';
        const chosenCarrierName = 'OTO Gateway';

        const estimatedFee =
          rateEstimate.quotes.find((q) => q.carrierCode === chosenCarrierCode)
            ?.totalRate || 28.75;

        const trackingNumber = `WASL${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;

        const shipment = this.shipmentRepository.create({
          merchantId,
          trackingNumber,
          paymentMethod: validItem.paymentMethod,
          codAmount: validItem.codAmount,
          weightKg: validItem.weightKg,
          piecesCount: validItem.piecesCount,
          packageDescription: validItem.packageDescription || 'Bulk imported goods',
          pickupAddressId: validItem.pickupAddressId,
          deliveryAddressId: deliveryAddress.id,
          carrierName: chosenCarrierName,
          carrierTrackingUrl: `https://www.waslship.com/track/${trackingNumber}`,
          otoDeliveryFee: estimatedFee,
          status: ShipmentStatus.Created,
        });

        const savedShipment = await this.shipmentRepository.save(shipment);

        // Perform direct carrier booking via OTO if autoBook enabled
        if (dto.autoBook) {
          try {
            const bookingResult = await this.carrierRegistry.bookDirectShipment(
              'OTO',
              {
                shipmentId: savedShipment.id,
                trackingNumber,
                senderName: 'WaslShip Merchant',
                senderPhone: '+966500000000',
                senderCity: 'Riyadh',
                senderStreet: 'Main Logistics Park',
                recipientName: validItem.recipientName,
                recipientPhone: validItem.recipientPhone,
                recipientCity: validItem.recipientCity,
                recipientStreet: validItem.recipientStreet,
                weightKg: validItem.weightKg,
                piecesCount: validItem.piecesCount,
                codAmount: validItem.codAmount,
                packageDescription: validItem.packageDescription,
              },
            );

            if (bookingResult.success) {
              savedShipment.carrierName = bookingResult.carrierName;
              savedShipment.trackingNumber = bookingResult.trackingNumber;
              savedShipment.carrierTrackingUrl = bookingResult.trackingUrl;
              savedShipment.status = ShipmentStatus.ReadyForPickup;
              await this.shipmentRepository.save(savedShipment);
            }
          } catch (bookingErr: any) {
            this.logger.warn(
              `Auto-booking warning for row ${validItem.rowNumber}: ${bookingErr.message}`,
            );
          }
        }

        createdShipments.push(savedShipment);
      } catch (err: any) {
        this.logger.error(
          `Error creating shipment for row ${validItem.rowNumber}: ${err.message}`,
        );
        validationErrors.push({
          rowNumber: validItem.rowNumber,
          rowData: validItem.rawData,
          errors: [`Database creation error: ${err.message}`],
        });
      }
    }

    return {
      totalRowsProcessed: rawRows.length,
      successfulCount: createdShipments.length,
      failedCount: validationErrors.length,
      createdShipmentsCount: createdShipments.length,
      createdShipments,
      errors: validationErrors,
      summaryMessage: `Successfully created ${createdShipments.length} out of ${rawRows.length} shipments.${
        validationErrors.length > 0
          ? ` ${validationErrors.length} rows failed validation.`
          : ''
      }`,
    };
  }
}
