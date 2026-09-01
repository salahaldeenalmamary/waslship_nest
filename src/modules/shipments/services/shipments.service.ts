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
import { OtoWebhookLog } from '../entities/oto-webhook-log.entity';
import { UserAddress } from '../../users/entities/user-address.entity';
import { User } from '../../users/entities/user.entity';
import { ShipmentStatus, PaymentMethod } from '../enums/shipment.enum';
import {
  CreateShipmentDto,
  AdminCreateShipmentDto,
  BulkCreateOrderDto,
  UpdateShipmentStatusDto,
  DeliveryFeeCheckDto,
  UpdateCarrierDetailsDto,
  BulkUpdateShipmentStatusDto,
} from '../dtos/shipment.dto';
import { CreateUserAddressDto } from '../../users/dtos/user.dto';
import { OtoClient } from './oto.client';
import { PaginationParamsDto, PagedResult } from '../../../common/dtos/pagination.dto';
import { WalletService } from '../../wallet/services/wallet.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { ShipmentAuditService, AuditActor } from './shipment-audit.service';
import {
  DomainEventNames,
  ShipmentCreatedEvent,
  ShipmentStatusChangedEvent,
} from '../../../common/events/domain-events';

export interface OtoAddressDetails {
  senderName: string;
  senderPhone: string;
  senderCity: string;
  senderAddress: string;
  senderDistrict?: string;
  senderPostalCode?: string;
  senderCountry?: string;
  recipientName: string;
  recipientPhone: string;
  recipientCity: string;
  recipientAddress: string;
  recipientDistrict?: string;
  recipientPostalCode?: string;
  recipientCountry?: string;
}

export interface ValidatedAddressesResult {
  pickupAddress: UserAddress;
  deliveryAddress: UserAddress;
  otoAddressDetails: OtoAddressDetails;
}

export interface PreparedOtoShipmentPayload extends OtoAddressDetails {
  orderId?: string | number;
  deliveryOptionId?: string | number;
  packageWeight?: number;
  packageCount?: number;
  amount?: number;
  amount_due?: number;
  payment_method?: string;
  currency?: string;
}

@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);

  constructor(
    @InjectRepository(Shipment)
    private readonly shipmentRepository: Repository<Shipment>,
    @InjectRepository(OtoWebhookLog)
    private readonly webhookLogRepository: Repository<OtoWebhookLog>,
    @InjectRepository(UserAddress)
    private readonly addressRepository: Repository<UserAddress>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly auditService: ShipmentAuditService,
    private readonly otoClient: OtoClient,
    private readonly walletService: WalletService,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Helper function to fetch and validate UserAddress details based on pickupAddressId and deliveryAddressId
   * and format the address payload for OTO shipment and order operations.
   */
  async fetchAndValidateAddresses(
    pickupAddressId: string,
    deliveryAddressId: string,
  ): Promise<ValidatedAddressesResult> {
    if (!pickupAddressId) {
      throw new BadRequestException('pickupAddressId is required');
    }
    if (!deliveryAddressId) {
      throw new BadRequestException('deliveryAddressId is required');
    }

    const pickupAddress = await this.addressRepository.findOne({
      where: { id: pickupAddressId, isDeleted: false },
    });
    if (!pickupAddress) {
      throw new NotFoundException(
        `Pickup address with ID '${pickupAddressId}' was not found in UserAddress records`,
      );
    }

    const deliveryAddress = await this.addressRepository.findOne({
      where: { id: deliveryAddressId, isDeleted: false },
    });
    if (!deliveryAddress) {
      throw new NotFoundException(
        `Delivery address with ID '${deliveryAddressId}' was not found in UserAddress records`,
      );
    }

    if (!pickupAddress.city) {
      throw new BadRequestException(`Pickup address '${pickupAddressId}' does not have a city specified`);
    }
    if (!deliveryAddress.city) {
      throw new BadRequestException(`Delivery address '${deliveryAddressId}' does not have a city specified`);
    }

    const formatAddress = (addr: UserAddress) => {
      const parts = [addr.street, addr.district, addr.buildingNumber, addr.city].filter(Boolean);
      return parts.length > 0 ? parts.join(', ') : addr.city || 'Standard Address';
    };

    const otoAddressDetails: OtoAddressDetails = {
      senderName: pickupAddress.contactName || 'Wasl Merchant',
      senderPhone: pickupAddress.contactPhone || '+966500000000',
      senderCity: pickupAddress.city,
      senderAddress: formatAddress(pickupAddress),
      senderDistrict: pickupAddress.district,
      senderPostalCode: pickupAddress.postalCode,
      senderCountry: pickupAddress.country || 'Saudi Arabia',

      recipientName: deliveryAddress.contactName || 'Customer',
      recipientPhone: deliveryAddress.contactPhone || '+966500000001',
      recipientCity: deliveryAddress.city,
      recipientAddress: formatAddress(deliveryAddress),
      recipientDistrict: deliveryAddress.district,
      recipientPostalCode: deliveryAddress.postalCode,
      recipientCountry: deliveryAddress.country || 'Saudi Arabia',
    };

    return {
      pickupAddress,
      deliveryAddress,
      otoAddressDetails,
    };
  }

  /**
   * Helper function to prepare the full payload for the OTO createShipment / createOrder request
   * by fetching and validating the UserAddress records and populating order & package specifications.
   */
  async prepareOtoCreateShipmentPayload(
    pickupAddressId: string,
    deliveryAddressId: string,
    shipmentDetails?: {
      orderId?: string | number;
      deliveryOptionId?: string | number;
      weightKg?: number;
      piecesCount?: number;
      paymentMethod?: PaymentMethod | string;
      codAmount?: number;
      currency?: string;
    },
  ): Promise<{
    pickupAddress: UserAddress;
    deliveryAddress: UserAddress;
    payload: PreparedOtoShipmentPayload;
  }> {
    const { pickupAddress, deliveryAddress, otoAddressDetails } =
      await this.fetchAndValidateAddresses(pickupAddressId, deliveryAddressId);

    const isCod =
      shipmentDetails?.paymentMethod === PaymentMethod.COD ||
      shipmentDetails?.paymentMethod === 'COD';
    const codAmount = shipmentDetails?.codAmount || 0;

    const payload: PreparedOtoShipmentPayload = {
      ...otoAddressDetails,
      orderId: shipmentDetails?.orderId,
      deliveryOptionId: shipmentDetails?.deliveryOptionId,
      packageWeight: shipmentDetails?.weightKg || 1,
      packageCount: shipmentDetails?.piecesCount || 1,
      amount: codAmount,
      amount_due: isCod ? codAmount : 0,
      payment_method: isCod ? 'COD' : 'Prepaid',
      currency: shipmentDetails?.currency || 'SAR',
    };

    return {
      pickupAddress,
      deliveryAddress,
      payload,
    };
  }

  async createShipment(merchantId: string, dto: CreateShipmentDto) {
    // 1. Fetch & validate UserAddress records and construct OTO address metadata
    const { pickupAddress, deliveryAddress } =
      await this.fetchAndValidateAddresses(dto.pickupAddressId, dto.deliveryAddressId);

    const senderCity = pickupAddress.city;
    const recipientCity = deliveryAddress.city;

    // 2. Estimate delivery fee
    const feeEstimation = await this.otoClient.checkDeliveryFee(
      senderCity,
      recipientCity,
      dto.weightKg || 1,
    );
    const shippingCost = feeEstimation.estimatedFee || 28.0;

    // 3. Check & reserve balance if merchant wallet payment
    if (dto.paymentMethod === PaymentMethod.Wallet || dto.paymentMethod === PaymentMethod.Prepaid) {
      await this.walletService.reserveShipmentCost(merchantId, shippingCost);
    }

    const trackingNumber = this.generateTrackingNumber();

    const shipment = this.shipmentRepository.create({
      ...dto,
      merchantId,
      trackingNumber,
      status: ShipmentStatus.Created,
      shippingCost,
      currency: 'SAR',
      pickupAddressId: pickupAddress.id,
      deliveryAddressId: deliveryAddress.id,
    });
    shipment.pickupAddress = pickupAddress;
    shipment.deliveryAddress = deliveryAddress;

    const saved = await this.shipmentRepository.save(shipment);

    // 4. Call OTO Gateway with the populated address data
    const otoRes = await this.otoClient.createOtoOrder(saved);
    if (otoRes && otoRes.otoOrderId) {
      saved.otoOrderId = otoRes.otoOrderId;
      saved.carrierName = otoRes.carrierName;
      saved.carrierTrackingUrl = otoRes.trackingUrl;
      saved.otoDeliveryFee = otoRes.deliveryFee;
      await this.shipmentRepository.save(saved);
    }

    // 5. Emit Domain Event
    this.eventEmitter.emit(
      DomainEventNames.SHIPMENT_CREATED,
      new ShipmentCreatedEvent(
        saved.id,
        merchantId,
        saved.trackingNumber,
        saved.shippingCost,
        saved.paymentMethod,
        saved.codAmount,
        saved.carrierName,
        deliveryAddress.contactName,
        deliveryAddress.city,
      ),
    );

    return saved;
  }

  async bulkCreateShipments(merchantId: string, dto: BulkCreateOrderDto) {
    const results = [];
    for (const order of dto.orders) {
      try {
        const created = await this.createShipment(merchantId, order);
        results.push({ success: true, trackingNumber: created.trackingNumber, id: created.id });
      } catch (err: any) {
        results.push({ success: false, error: err.message, deliveryAddressId: order.deliveryAddressId });
      }
    }
    return {
      total: dto.orders.length,
      successful: results.filter((r) => r.success).length,
      orders: results,
    };
  }

  async getShipments(
    merchantId: string,
    pagination: PaginationParamsDto,
    status?: ShipmentStatus,
    searchTerm?: string,
  ) {
    const query = this.shipmentRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.pickupAddress', 'pickupAddress')
      .leftJoinAndSelect('s.deliveryAddress', 'deliveryAddress')
      .where('s.merchantId = :merchantId', { merchantId })
      .andWhere('s.isDeleted = :isDeleted', { isDeleted: false });

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

  async getShipmentDetails(shipmentId: string, merchantId?: string) {
    const query: any = { id: shipmentId, isDeleted: false };
    if (merchantId) query.merchantId = merchantId;

    const shipment = await this.shipmentRepository.findOne({
      where: query,
      relations: ['pickupAddress', 'deliveryAddress'],
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    return shipment;
  }

  async trackShipment(trackingNumber: string) {
    const shipment = await this.shipmentRepository.findOne({
      where: { trackingNumber, isDeleted: false },
      relations: ['pickupAddress', 'deliveryAddress'],
    });
    if (!shipment) throw new NotFoundException(`Tracking #${trackingNumber} not found`);

    return {
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      carrierName: shipment.carrierName,
      senderCity: shipment.pickupAddress?.city || 'Riyadh',
      recipientCity: shipment.deliveryAddress?.city || 'Jeddah',
      pickupAddress: shipment.pickupAddress,
      deliveryAddress: shipment.deliveryAddress,
      createdAt: shipment.createdAt,
      deliveredAt: shipment.deliveredAt,
      carrierTrackingUrl: shipment.carrierTrackingUrl,
      notes: shipment.notes,
    };
  }

  async updateShipmentStatus(
    shipmentId: string,
    dto: UpdateShipmentStatusDto,
    merchantId?: string,
    admin?: AuditActor,
    source?: string,
  ) {
    const shipment = await this.getShipmentDetails(shipmentId, merchantId);

    const oldStatus = shipment.status;
    shipment.status = dto.status;
    if (dto.notes) shipment.notes = dto.notes;

    if (admin) {
      shipment.lastModifiedByAdminId = admin.id || null;
      shipment.lastModifiedByAdminName = admin.fullName || admin.email || null;
    }

    if (dto.status === ShipmentStatus.Delivered && oldStatus !== ShipmentStatus.Delivered) {
      shipment.deliveredAt = new Date();
      if (shipment.paymentMethod === PaymentMethod.COD && shipment.codAmount > 0) {
        shipment.isCodSettled = true;
      }
    }

    if (dto.status === ShipmentStatus.Cancelled && oldStatus !== ShipmentStatus.Cancelled) {
      if (shipment.otoOrderId) {
        await this.otoClient.cancelOtoOrder(shipment.otoOrderId);
      }
    }

    const updated = await this.shipmentRepository.save(shipment);

    // Record persistent audit log for state transition if status changed or admin modified it
    if (oldStatus !== updated.status || admin) {
      await this.auditService.recordStateTransition(
        updated.id,
        updated.trackingNumber,
        oldStatus,
        updated.status,
        admin || null,
        source || (admin ? 'ADMIN_PORTAL' : merchantId ? 'MERCHANT_PORTAL' : 'SYSTEM'),
        dto.notes,
        {
          paymentMethod: updated.paymentMethod,
          codAmount: updated.codAmount,
          shippingCost: updated.shippingCost,
          carrierName: updated.carrierName,
        },
      );
    }

    // Emit Domain Event for Decoupled Handlers (Wallet, Notifications, Analytics)
    this.eventEmitter.emit(
      DomainEventNames.SHIPMENT_STATUS_CHANGED,
      new ShipmentStatusChangedEvent(
        updated.id,
        updated.merchantId,
        updated.trackingNumber,
        oldStatus,
        updated.status,
        updated.paymentMethod,
        updated.codAmount,
        updated.shippingCost,
        dto.notes,
        updated.carrierName,
      ),
    );

    return updated;
  }

  async holdShipment(shipmentId: string, merchantId?: string, admin?: AuditActor) {
    const shipment = await this.getShipmentDetails(shipmentId, merchantId);
    const oldStatus = shipment.status;
    shipment.status = ShipmentStatus.OnHold;
    if (admin) {
      shipment.lastModifiedByAdminId = admin.id || null;
      shipment.lastModifiedByAdminName = admin.fullName || admin.email || null;
    }
    const saved = await this.shipmentRepository.save(shipment);
    if (oldStatus !== ShipmentStatus.OnHold) {
      await this.auditService.recordStateTransition(
        saved.id,
        saved.trackingNumber,
        oldStatus,
        ShipmentStatus.OnHold,
        admin || null,
        admin ? 'ADMIN_PORTAL' : 'SYSTEM',
        'Shipment placed on hold by administrator',
      );
    }
    return saved;
  }

  async unholdShipment(shipmentId: string, merchantId?: string, admin?: AuditActor) {
    const shipment = await this.getShipmentDetails(shipmentId, merchantId);
    if (shipment.status === ShipmentStatus.OnHold) {
      const oldStatus = shipment.status;
      shipment.status = ShipmentStatus.InTransit;
      if (admin) {
        shipment.lastModifiedByAdminId = admin.id || null;
        shipment.lastModifiedByAdminName = admin.fullName || admin.email || null;
      }
      const saved = await this.shipmentRepository.save(shipment);
      await this.auditService.recordStateTransition(
        saved.id,
        saved.trackingNumber,
        oldStatus,
        ShipmentStatus.InTransit,
        admin || null,
        admin ? 'ADMIN_PORTAL' : 'SYSTEM',
        'Shipment released from hold back to InTransit',
      );
      return saved;
    }
    return shipment;
  }

  async cancelShipment(shipmentId: string, merchantId?: string) {
    return this.updateShipmentStatus(
      shipmentId,
      { status: ShipmentStatus.Cancelled, notes: 'Cancelled by merchant' },
      merchantId,
    );
  }

  async checkDeliveryFee(dto: DeliveryFeeCheckDto) {
    return this.otoClient.checkDeliveryFee(
      dto.pickupCity,
      dto.deliveryCity,
      dto.weightKg || 1,
    );
  }

  /**
   * Step 2: Query available delivery companies & fee options for an order created in Step 1
   */
  async getDeliveryFeeForOrder(orderId: string) {
    const shipment = await this.shipmentRepository.findOne({
      where: [{ id: orderId }, { otoOrderId: orderId }],
    });
    const effectiveOrderId = shipment?.otoOrderId || orderId;
    return this.otoClient.getDeliveryFeeAsync(effectiveOrderId);
  }

  /**
   * Step 3: Complete shipment on OTO with selected deliveryOptionId
   */
  async createOtoShipment(orderId: string, deliveryOptionId?: string | number) {
    const shipment = await this.shipmentRepository.findOne({
      where: [{ id: orderId }, { otoOrderId: orderId }],
    });
    const effectiveOrderId = shipment?.otoOrderId || orderId;

    const result = await this.otoClient.createShipment({
      orderId: effectiveOrderId,
      deliveryOptionId,
    });

    // If matching internal shipment exists, update its carrier details & status
    if (shipment && result && result.success !== false) {
      if (result.otoId) shipment.otoOrderId = result.otoId;
      if (result.deliveryCompanyName || result.deliveryCompany) {
        shipment.carrierName =
          result.deliveryCompanyName || result.deliveryCompany;
      }
      if (result.trackingUrl) shipment.carrierTrackingUrl = result.trackingUrl;
      if (result.deliveryFee) shipment.otoDeliveryFee = result.deliveryFee;
      if (result.trackingNumber) shipment.trackingNumber = result.trackingNumber;
      if (shipment.status === ShipmentStatus.Created) {
        shipment.status = ShipmentStatus.ReadyForPickup;
      }
      await this.shipmentRepository.save(shipment);
    }

    return {
      isSuccess: result.success !== false,
      otoResponse: result,
      shipment: shipment || undefined,
    };
  }

  /**
   * Merchant helper: Select deliveryOptionId and complete Step 3 for a specific shipment
   */
  async selectDeliveryOptionForShipment(
    shipmentId: string,
    merchantId: string,
    deliveryOptionId: string | number,
  ) {
    const shipment = await this.getShipmentDetails(shipmentId, merchantId);
    const effectiveOrderId = shipment.otoOrderId || shipment.id;

    const result = await this.otoClient.createShipment({
      orderId: effectiveOrderId,
      deliveryOptionId,
    });

    if (result && result.success !== false) {
      if (result.otoId) shipment.otoOrderId = result.otoId;
      if (result.deliveryCompanyName || result.deliveryCompany) {
        shipment.carrierName =
          result.deliveryCompanyName || result.deliveryCompany;
      }
      if (result.trackingUrl) shipment.carrierTrackingUrl = result.trackingUrl;
      if (result.deliveryFee) shipment.otoDeliveryFee = result.deliveryFee;
      if (result.trackingNumber) shipment.trackingNumber = result.trackingNumber;
      if (shipment.status === ShipmentStatus.Created) {
        shipment.status = ShipmentStatus.ReadyForPickup;
      }
      await this.shipmentRepository.save(shipment);
    }

    return {
      isSuccess: result.success !== false,
      message: 'Shipment booking finalized with selected delivery option.',
      otoResponse: result,
      shipment,
    };
  }

  /**
   * Admin helper: Select deliveryOptionId and complete Step 3 for any shipment
   */
  async selectDeliveryOptionAdmin(
    shipmentId: string,
    deliveryOptionId: string | number,
    admin?: AuditActor,
  ) {
    const shipment = await this.getShipmentDetails(shipmentId);
    const effectiveOrderId = shipment.otoOrderId || shipment.id;
    const oldStatus = shipment.status;

    const result = await this.otoClient.createShipment({
      orderId: effectiveOrderId,
      deliveryOptionId,
    });

    if (result && result.success !== false) {
      if (result.otoId) shipment.otoOrderId = result.otoId;
      if (result.deliveryCompanyName || result.deliveryCompany) {
        shipment.carrierName =
          result.deliveryCompanyName || result.deliveryCompany;
      }
      if (result.trackingUrl) shipment.carrierTrackingUrl = result.trackingUrl;
      if (result.deliveryFee) shipment.otoDeliveryFee = result.deliveryFee;
      if (result.trackingNumber) shipment.trackingNumber = result.trackingNumber;
      if (shipment.status === ShipmentStatus.Created) {
        shipment.status = ShipmentStatus.ReadyForPickup;
      }
      if (admin) {
        shipment.lastModifiedByAdminId = admin.id || null;
        shipment.lastModifiedByAdminName = admin.fullName || admin.email || null;
      }
      await this.shipmentRepository.save(shipment);

      // Record administrative courier selection and state transition in audit log
      await this.auditService.recordAudit({
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        action: 'ADMIN_SELECTED_DELIVERY_OPTION',
        fromStatus: oldStatus,
        toStatus: shipment.status,
        actor: admin || null,
        source: 'ADMIN_PORTAL',
        notes: `Courier '${shipment.carrierName || 'OTO'}' selected by administrator (Delivery Option ID: ${deliveryOptionId})`,
        metadata: {
          deliveryOptionId,
          carrierName: shipment.carrierName,
          trackingUrl: shipment.carrierTrackingUrl,
          otoDeliveryFee: shipment.otoDeliveryFee,
          otoResponse: result,
        },
      });
    }

    return {
      isSuccess: result.success !== false,
      message: 'Shipment carrier booking completed by Admin.',
      otoResponse: result,
      shipment,
    };
  }

  /**
   * Admin / Merchant: Query available delivery carriers & options for a shipment (Step 2)
   */
  async getDeliveryOptionsForShipment(shipmentId: string, merchantId?: string) {
    const shipment = await this.getShipmentDetails(shipmentId, merchantId);
    const effectiveOrderId = shipment.otoOrderId || shipment.id;
    const otoOptions = await this.otoClient.getDeliveryFeeAsync(effectiveOrderId);
    return {
      shipmentId: shipment.id,
      trackingNumber: shipment.trackingNumber,
      otoOrderId: shipment.otoOrderId,
      pickupCity: shipment.pickupAddress?.city || 'Riyadh',
      deliveryCity: shipment.deliveryAddress?.city || 'Jeddah',
      options: otoOptions,
    };
  }

  /**
   * Admin / Merchant: Get printable shipping label / Air Waybill
   */
  async getShipmentLabel(shipmentId: string, merchantId?: string) {
    const shipment = await this.getShipmentDetails(shipmentId, merchantId);
    const effectiveOrderId = shipment.otoOrderId || shipment.id;
    const labelResult = await this.otoClient.printLabel(effectiveOrderId);
    return {
      shipmentId: shipment.id,
      trackingNumber: shipment.trackingNumber,
      carrierName: shipment.carrierName,
      status: shipment.status,
      senderCity: shipment.pickupAddress?.city,
      recipientCity: shipment.deliveryAddress?.city,
      labelUrl: labelResult.labelUrl || `https://api.waslship.com/labels/${shipment.trackingNumber}.pdf`,
      ...labelResult,
    };
  }

  /**
   * Admin: Get all saved addresses for a specific merchant
   */
  async getMerchantAddressesAdmin(merchantId: string) {
    const merchant = await this.userRepository.findOne({
      where: { id: merchantId, isDeleted: false },
    });
    if (!merchant) {
      throw new NotFoundException(`Merchant with ID '${merchantId}' not found`);
    }

    const addresses = await this.addressRepository.find({
      where: { userId: merchantId, isDeleted: false },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });

    return {
      merchant: {
        id: merchant.id,
        fullName: merchant.fullName,
        email: merchant.email,
        phone: merchant.phoneNumber,
        companyName: merchant.companyName,
      },
      addresses,
    };
  }

  /**
   * Admin: Create a new address for a specific merchant
   */
  async createMerchantAddressAdmin(merchantId: string, dto: CreateUserAddressDto) {
    const merchant = await this.userRepository.findOne({
      where: { id: merchantId, isDeleted: false },
    });
    if (!merchant) {
      throw new NotFoundException(`Merchant with ID '${merchantId}' not found`);
    }

    if (dto.isDefault) {
      await this.addressRepository.update(
        { userId: merchantId, isDeleted: false },
        { isDefault: false },
      );
    }

    const address = this.addressRepository.create({
      ...dto,
      userId: merchantId,
    });
    return this.addressRepository.save(address);
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
      await this.fetchAndValidateAddresses(dto.pickupAddressId, dto.deliveryAddressId);

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
    const feeEstimation = await this.otoClient.checkDeliveryFee(
      senderCity,
      recipientCity,
      dto.weightKg || 1,
    );
    const shippingCost = feeEstimation.estimatedFee || 28.0;

    // 5. Reserve or deduct from merchant wallet if prepaid/wallet payment
    if (dto.paymentMethod === PaymentMethod.Wallet || dto.paymentMethod === PaymentMethod.Prepaid) {
      try {
        await this.walletService.reserveShipmentCost(dto.merchantId, shippingCost);
      } catch (err: any) {
        this.logger.warn(`Admin shipment creation wallet warning for merchant ${dto.merchantId}: ${err.message}`);
      }
    }

    const trackingNumber = this.generateTrackingNumber();

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
        finalizedBooking = await this.selectDeliveryOptionAdmin(
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

  // Dashboard Metrics
  async getDashboardOverview(merchantId?: string) {
    const query = this.shipmentRepository.createQueryBuilder('s').where('s.isDeleted = false');
    if (merchantId) query.andWhere('s.merchantId = :merchantId', { merchantId });

    const totalShipments = await query.getCount();
    const deliveredCount = await query
      .clone()
      .andWhere('s.status = :st', { st: ShipmentStatus.Delivered })
      .getCount();
    const inTransitCount = await query
      .clone()
      .andWhere('s.status IN (:...sts)', {
        sts: [ShipmentStatus.InTransit, ShipmentStatus.PickedUp, ShipmentStatus.OutForDelivery],
      })
      .getCount();
    const cancelledCount = await query
      .clone()
      .andWhere('s.status = :st', { st: ShipmentStatus.Cancelled })
      .getCount();

    const recentShipments = await query
      .clone()
      .orderBy('s.createdAt', 'DESC')
      .take(5)
      .getMany();

    return {
      totalShipments,
      deliveredCount,
      inTransitCount,
      cancelledCount,
      successRate:
        totalShipments > 0
          ? ((deliveredCount / totalShipments) * 100).toFixed(1) + '%'
          : '100%',
      recentShipments,
    };
  }

  // OTO Webhooks
  async handleOtoWebhook(payload: any, signature: string, rawBody: string) {
    const isValid = this.otoClient.verifyWebhookSignature(rawBody, signature);
    const log = this.webhookLogRepository.create({
      eventType: payload.event || payload.status || 'unknown',
      otoOrderId: payload.otoId || payload.orderId,
      trackingNumber: payload.trackingNumber || payload.tracking_number,
      payload: typeof rawBody === 'string' ? rawBody : JSON.stringify(payload),
      isProcessed: isValid,
    });

    if (!isValid) {
      log.errorMessage = 'Signature verification failed';
      await this.webhookLogRepository.save(log);
      throw new BadRequestException('Invalid webhook signature');
    }

    try {
      // Map OTO status to WaslShip status
      const otoStatus = (payload.status || '').toLowerCase();
      let newStatus: ShipmentStatus | null = null;

      if (otoStatus.includes('delivered')) newStatus = ShipmentStatus.Delivered;
      else if (otoStatus.includes('transit')) newStatus = ShipmentStatus.InTransit;
      else if (otoStatus.includes('pickup')) newStatus = ShipmentStatus.PickedUp;
      else if (otoStatus.includes('cancel')) newStatus = ShipmentStatus.Cancelled;
      else if (otoStatus.includes('return')) newStatus = ShipmentStatus.Returned;

      if (newStatus && (payload.trackingNumber || payload.orderId)) {
        const shipment = await this.shipmentRepository.findOne({
          where: [
            { trackingNumber: payload.trackingNumber },
            { otoOrderId: payload.otoId || payload.orderId },
          ],
        });

        if (shipment) {
          await this.updateShipmentStatus(
            shipment.id,
            {
              status: newStatus,
              notes: `Updated via OTO Webhook [${payload.status}]`,
            },
            undefined,
            undefined,
            'OTO_WEBHOOK',
          );
        }
      }

      await this.webhookLogRepository.save(log);
      return { received: true };
    } catch (err: any) {
      log.errorMessage = err.message;
      await this.webhookLogRepository.save(log);
      return { received: false, error: err.message };
    }
  }

  async getWebhookLogs(pagination: PaginationParamsDto) {
    const [items, total] = await this.webhookLogRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (pagination.pageNumber - 1) * pagination.pageSize,
      take: pagination.pageSize,
    });
    return new PagedResult(items, total, pagination.pageNumber, pagination.pageSize);
  }

  // --- Administrative Shipment Audit History ---
  async getShipmentAuditLogs(shipmentId: string, pagination?: PaginationParamsDto) {
    await this.getShipmentDetails(shipmentId);
    return this.auditService.getAuditLogsForShipment(shipmentId, pagination);
  }

  async getAllAuditLogsAdmin(
    pagination?: PaginationParamsDto,
    action?: string,
    adminId?: string,
    shipmentId?: string,
  ) {
    return this.auditService.getAllAuditLogs(pagination, action, adminId, shipmentId);
  }

  // --- Additional Admin Shipment Operations ---
  async updateCarrierDetailsAdmin(
    shipmentId: string,
    dto: UpdateCarrierDetailsDto,
    admin?: AuditActor,
  ) {
    const shipment = await this.getShipmentDetails(shipmentId);
    const oldCarrier = shipment.carrierName;
    const oldOtoId = shipment.otoOrderId;

    if (dto.carrierName !== undefined) shipment.carrierName = dto.carrierName;
    if (dto.carrierTrackingUrl !== undefined) shipment.carrierTrackingUrl = dto.carrierTrackingUrl;
    if (dto.otoOrderId !== undefined) shipment.otoOrderId = dto.otoOrderId;
    if (dto.otoDeliveryFee !== undefined) shipment.otoDeliveryFee = dto.otoDeliveryFee;

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

  async bulkUpdateShipmentStatusAdmin(
    dto: BulkUpdateShipmentStatusDto,
    admin?: AuditActor,
  ) {
    const updatedShipments = [];
    const errors = [];

    for (const shipmentId of dto.shipmentIds) {
      try {
        const updated = await this.updateShipmentStatus(
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

  async syncOtoOrderAdmin(shipmentId: string) {
    const shipment = await this.getShipmentDetails(shipmentId);
    const otoRes = await this.otoClient.createOtoOrder(shipment);

    if (otoRes && otoRes.otoOrderId) {
      shipment.otoOrderId = otoRes.otoOrderId;
      shipment.carrierName = otoRes.carrierName;
      shipment.carrierTrackingUrl = otoRes.trackingUrl;
      shipment.otoDeliveryFee = otoRes.deliveryFee;
      await this.shipmentRepository.save(shipment);
    }

    return {
      message: 'Shipment synced with OTO Gateway successfully',
      shipment,
      otoResponse: otoRes,
    };
  }

  async getShipmentAnalyticsAdmin() {
    const query = this.shipmentRepository.createQueryBuilder('s').where('s.isDeleted = false');

    const totalCount = await query.getCount();

    const statusCountsRaw = await query
      .select('s.status', 'status')
      .addSelect('COUNT(s.id)', 'count')
      .groupBy('s.status')
      .getRawMany();

    const carrierCountsRaw = await query
      .select('s.carrierName', 'carrierName')
      .addSelect('COUNT(s.id)', 'count')
      .groupBy('s.carrierName')
      .getRawMany();

    const paymentMethodCountsRaw = await query
      .select('s.paymentMethod', 'paymentMethod')
      .addSelect('COUNT(s.id)', 'count')
      .groupBy('s.paymentMethod')
      .getRawMany();

    const financialTotals = await query
      .select('SUM(s.shippingCost)', 'totalShippingCost')
      .addSelect('SUM(s.codAmount)', 'totalCodAmount')
      .addSelect('SUM(s.otoDeliveryFee)', 'totalOtoDeliveryFee')
      .getRawOne();

    return {
      totalShipments: totalCount,
      statusBreakdown: statusCountsRaw.reduce((acc, curr) => {
        acc[curr.status] = parseInt(curr.count, 10);
        return acc;
      }, {}),
      carrierBreakdown: carrierCountsRaw.reduce((acc, curr) => {
        const key = curr.carrierName || 'Unassigned';
        acc[key] = parseInt(curr.count, 10);
        return acc;
      }, {}),
      paymentMethodBreakdown: paymentMethodCountsRaw.reduce((acc, curr) => {
        acc[curr.paymentMethod] = parseInt(curr.count, 10);
        return acc;
      }, {}),
      financials: {
        totalShippingCost: parseFloat(financialTotals?.totalShippingCost || '0'),
        totalCodAmount: parseFloat(financialTotals?.totalCodAmount || '0'),
        totalOtoDeliveryFee: parseFloat(financialTotals?.totalOtoDeliveryFee || '0'),
        currency: 'SAR',
      },
    };
  }

  private generateTrackingNumber(): string {
    const random = Math.floor(10000000 + Math.random() * 90000000);
    return `WSL${random}`;
  }
}
