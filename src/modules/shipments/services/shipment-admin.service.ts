import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Shipment } from '../entities/shipment.entity';
import { User } from '../../users/entities/user.entity';
import { ShipmentStatus, PaymentMethod } from '../enums/shipment.enum';
import {
  AdminCreateShipmentDto,
  UpdateCarrierDetailsDto,
  BulkUpdateShipmentStatusDto,
  UpdateShipmentStatusDto,
} from '../dtos';
import { OtoClient } from './oto.client';
import { ShipmentAddressService } from './shipment-address.service';
import { ShipmentCarrierService } from './shipment-carrier.service';
import { ShipmentAuditService, AuditActor } from './shipment-audit.service';
import { WalletService } from '../../wallet/services/wallet.service';
import { PaginationParamsDto, PagedResult } from '../../../common/dtos/pagination.dto';
import {
  DomainEventNames,
  ShipmentCreatedEvent,
} from '../../../common/events/domain-events';

@Injectable()
export class ShipmentAdminService {
  private readonly logger = new Logger(ShipmentAdminService.name);

  constructor(
    @InjectRepository(Shipment)
    private readonly shipmentRepository: Repository<Shipment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly addressService: ShipmentAddressService,
    private readonly carrierService: ShipmentCarrierService,
    private readonly auditService: ShipmentAuditService,
    private readonly otoClient: OtoClient,
    private readonly walletService: WalletService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Admin: List all shipments across all merchants with search & filters
   */
  async getAllShipmentsAdmin(
    pagination: PaginationParamsDto,
    status?: ShipmentStatus,
    searchTerm?: string,
  ) {
    const query = this.shipmentRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.pickupAddress', 'pickupAddress')
      .leftJoinAndSelect('s.deliveryAddress', 'deliveryAddress')
      .where('s.isDeleted = :isDeleted', { isDeleted: false });

    if (status) {
      query.andWhere('s.status = :status', { status });
    }

    if (searchTerm) {
      query.andWhere(
        '(s.trackingNumber LIKE :term OR pickupAddress.contactName LIKE :term OR deliveryAddress.contactName LIKE :term OR deliveryAddress.contactPhone LIKE :term OR pickupAddress.city LIKE :term OR deliveryAddress.city LIKE :term)',
        { term: `%${searchTerm}%` },
      );
    }

    query
      .orderBy('s.createdAt', 'DESC')
      .skip((pagination.pageNumber - 1) * pagination.pageSize)
      .take(pagination.pageSize);

    const [items, total] = await query.getManyAndCount();
    return new PagedResult(items, total, pagination.pageNumber, pagination.pageSize);
  }

  /**
   * Admin: Create shipment for a selected merchant using sender and receiver addresses from that same merchant
   */
  async createShipmentForMerchantByAdmin(
    dto: AdminCreateShipmentDto,
    admin?: AuditActor,
  ) {
    // 1. Verify merchant exists
    const merchant = await this.userRepository.findOne({
      where: { id: dto.merchantId, isDeleted: false },
    });
    if (!merchant) {
      throw new NotFoundException(`Merchant with ID '${dto.merchantId}' not found`);
    }

    // 2. Fetch & validate UserAddress records
    const { pickupAddress, deliveryAddress } =
      await this.addressService.fetchAndValidateAddresses(
        dto.pickupAddressId,
        dto.deliveryAddressId,
      );

    // 3. Enforce that sender (pickup) and receiver (delivery) addresses belong to the selected merchant
    if (pickupAddress.userId !== dto.merchantId) {
      throw new BadRequestException(
        `Selected sender/pickup address with ID '${dto.pickupAddressId}' does not belong to the selected merchant '${dto.merchantId}'`,
      );
    }
    if (deliveryAddress.userId !== dto.merchantId) {
      throw new BadRequestException(
        `Selected receiver/delivery address with ID '${dto.deliveryAddressId}' does not belong to the selected merchant '${dto.merchantId}'`,
      );
    }

    const senderCity = pickupAddress.city;
    const recipientCity = deliveryAddress.city;

    // 4. Estimate shipping cost
    const feeEstimation = await this.carrierService.checkDeliveryFee(
      senderCity,
      recipientCity,
      dto.weightKg || 1,
    );
    const shippingCost = feeEstimation.estimatedFee || 28.0;

    // 5. Reserve or deduct from merchant wallet if prepaid/wallet payment
    if (
      dto.paymentMethod === PaymentMethod.Wallet ||
      dto.paymentMethod === PaymentMethod.Prepaid
    ) {
      try {
        await this.walletService.reserveShipmentCost(dto.merchantId, shippingCost);
      } catch (err: any) {
        this.logger.warn(
          `Admin shipment creation wallet warning for merchant ${dto.merchantId}: ${err.message}`,
        );
      }
    }

    const random = Math.floor(10000000 + Math.random() * 90000000);
    const trackingNumber = `WSL${random}`;

    const shipment = this.shipmentRepository.create({
      merchantId: dto.merchantId,
      pickupAddressId: pickupAddress.id,
      deliveryAddressId: deliveryAddress.id,
      weightKg: dto.weightKg || 1,
      piecesCount: dto.piecesCount || 1,
      paymentMethod: dto.paymentMethod || PaymentMethod.Prepaid,
      codAmount: dto.codAmount || 0,
      packageDescription: dto.description,
      notes: dto.notes,
      trackingNumber,
      status: ShipmentStatus.Created,
      shippingCost,
      currency: 'SAR',
      createdByAdminId: admin?.id || null,
      createdByAdminName: admin?.fullName || admin?.email || 'Administrator',
      lastModifiedByAdminId: admin?.id || null,
      lastModifiedByAdminName: admin?.fullName || admin?.email || 'Administrator',
    });
    shipment.pickupAddress = pickupAddress;
    shipment.deliveryAddress = deliveryAddress;

    const saved = await this.shipmentRepository.save(shipment);

    // 6. Register order with OTO Gateway (Step 1)
    const otoRes = await this.otoClient.createOtoOrder(saved);
    if (otoRes && otoRes.otoOrderId) {
      saved.otoOrderId = otoRes.otoOrderId;
      saved.carrierName = otoRes.carrierName;
      saved.carrierTrackingUrl = otoRes.trackingUrl;
      saved.otoDeliveryFee = otoRes.deliveryFee;
      await this.shipmentRepository.save(saved);
    }

    // 7. If admin optionally provided deliveryOptionId, finalize booking immediately in Step 3!
    let finalizedBooking: any = null;
    if (dto.deliveryOptionId) {
      try {
        finalizedBooking = await this.carrierService.selectDeliveryOptionAdmin(
          saved.id,
          dto.deliveryOptionId,
          admin,
        );
      } catch (err: any) {
        this.logger.warn(
          `Auto-selection of deliveryOptionId ${dto.deliveryOptionId} by Admin failed: ${err.message}`,
        );
      }
    }

    // 8. Record audit log: Admin initiated shipment creation
    await this.auditService.recordShipmentInitiationByAdmin(
      saved,
      admin || { role: 'Admin' },
      {
        merchantId: dto.merchantId,
        merchantName: merchant.fullName,
        merchantEmail: merchant.email,
        pickupAddressId: pickupAddress.id,
        pickupAddressCity: pickupAddress.city,
        pickupContactName: pickupAddress.contactName,
        deliveryAddressId: deliveryAddress.id,
        deliveryAddressCity: deliveryAddress.city,
        deliveryContactName: deliveryAddress.contactName,
        weightKg: saved.weightKg,
        paymentMethod: saved.paymentMethod,
        shippingCost: saved.shippingCost,
        codAmount: saved.codAmount,
        otoOrderId: saved.otoOrderId,
        finalizedCarrierBooking: finalizedBooking ? true : false,
      },
    );

    // 9. Emit Domain Event
    this.eventEmitter.emit(
      DomainEventNames.SHIPMENT_CREATED,
      new ShipmentCreatedEvent(
        saved.id,
        dto.merchantId,
        saved.trackingNumber,
        saved.shippingCost,
        saved.paymentMethod,
        saved.codAmount,
        saved.carrierName,
        deliveryAddress.contactName,
        deliveryAddress.city,
      ),
    );

    return {
      message: 'Shipment created successfully for merchant by Admin',
      shipment: finalizedBooking?.shipment || saved,
      otoOrderId: saved.otoOrderId,
      trackingNumber: saved.trackingNumber,
      carrierBooking: finalizedBooking || undefined,
    };
  }

  /**
   * Admin: Manually update carrier and tracking information
   */
  async updateCarrierDetailsAdmin(
    shipmentId: string,
    dto: UpdateCarrierDetailsDto,
    admin?: AuditActor,
  ) {
    const shipment = await this.shipmentRepository.findOne({
      where: { id: shipmentId, isDeleted: false },
      relations: ['pickupAddress', 'deliveryAddress'],
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    const oldCarrier = shipment.carrierName;
    const oldOtoId = shipment.otoOrderId;

    if (dto.carrierName !== undefined) shipment.carrierName = dto.carrierName;
    if (dto.carrierTrackingUrl !== undefined)
      shipment.carrierTrackingUrl = dto.carrierTrackingUrl;
    if (dto.otoOrderId !== undefined) shipment.otoOrderId = dto.otoOrderId;
    if (dto.otoDeliveryFee !== undefined)
      shipment.otoDeliveryFee = dto.otoDeliveryFee;

    if (admin) {
      shipment.lastModifiedByAdminId = admin.id || null;
      shipment.lastModifiedByAdminName = admin.fullName || admin.email || null;
    }

    const saved = await this.shipmentRepository.save(shipment);

    await this.auditService.recordAudit({
      shipmentId: saved.id,
      trackingNumber: saved.trackingNumber,
      action: 'ADMIN_UPDATE_CARRIER',
      fromStatus: saved.status,
      toStatus: saved.status,
      actor: admin || null,
      source: 'ADMIN_PORTAL',
      notes: `Carrier information modified by administrator (Old Carrier: ${oldCarrier || 'None'}, New Carrier: ${saved.carrierName})`,
      metadata: {
        oldCarrier,
        newCarrier: saved.carrierName,
        oldOtoId,
        newOtoId: saved.otoOrderId,
        carrierTrackingUrl: saved.carrierTrackingUrl,
        otoDeliveryFee: saved.otoDeliveryFee,
      },
    });

    return saved;
  }

  /**
   * Admin: Bulk update status across multiple shipments
   */
  async bulkUpdateShipmentStatusAdmin(
    dto: BulkUpdateShipmentStatusDto,
    admin?: AuditActor,
    updateStatusFn?: (
      id: string,
      statusDto: UpdateShipmentStatusDto,
      merchantId?: string,
      adminActor?: AuditActor,
      source?: string,
    ) => Promise<Shipment>,
  ) {
    const updatedShipments = [];
    const errors = [];

    for (const shipmentId of dto.shipmentIds) {
      try {
        if (updateStatusFn) {
          const updated = await updateStatusFn(
            shipmentId,
            {
              status: dto.status,
              notes: dto.notes || 'Bulk status update by administrator',
            },
            undefined,
            admin,
            'ADMIN_BULK_ACTION',
          );
          updatedShipments.push(updated);
        }
      } catch (err: any) {
        errors.push({ shipmentId, error: err.message });
      }
    }

    return {
      total: dto.shipmentIds.length,
      successfulCount: updatedShipments.length,
      failedCount: errors.length,
      errors,
      updatedShipments,
    };
  }
}
