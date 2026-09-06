import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Shipment } from '../entities/shipment.entity';
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
} from '../dtos';
import { CreateUserAddressDto } from '../../users/dtos/user.dto';
import { PaginationParamsDto, PagedResult } from '../../../common/dtos/pagination.dto';
import { WalletService } from '../../wallet/services/wallet.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { OtoClient } from './oto.client';
import { ShipmentAuditService, AuditActor } from './shipment-audit.service';
import { ShipmentAddressService } from './shipment-address.service';
import { ShipmentCarrierService } from './shipment-carrier.service';
import { ShipmentAnalyticsService } from './shipment-analytics.service';
import { ShipmentTrackingService } from './shipment-tracking.service';
import { ShipmentWebhookService } from './shipment-webhook.service';
import { ShipmentAdminService } from './shipment-admin.service';
import {
  DomainEventNames,
  ShipmentCreatedEvent,
  ShipmentStatusChangedEvent,
} from '../../../common/events/domain-events';

@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);

  constructor(
    @InjectRepository(Shipment)
    private readonly shipmentRepository: Repository<Shipment>,
    private readonly addressService: ShipmentAddressService,
    private readonly carrierService: ShipmentCarrierService,
    private readonly analyticsService: ShipmentAnalyticsService,
    private readonly trackingService: ShipmentTrackingService,
    private readonly webhookService: ShipmentWebhookService,
    private readonly adminService: ShipmentAdminService,
    private readonly auditService: ShipmentAuditService,
    private readonly otoClient: OtoClient,
    private readonly walletService: WalletService,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ==========================================
  // Core Merchant Shipment CRUD & Lifecycle
  // ==========================================

  /**
   * Create a new shipment (Step 1 of standard shipment flow)
   */
  async createShipment(merchantId: string, dto: CreateShipmentDto) {
    // 1. Fetch & validate UserAddress records and construct OTO address metadata
    const { pickupAddress, deliveryAddress } =
      await this.addressService.fetchAndValidateAddresses(
        dto.pickupAddressId,
        dto.deliveryAddressId,
      );

    const senderCity = pickupAddress.city;
    const recipientCity = deliveryAddress.city;

    // 2. Estimate delivery fee
    const feeEstimation = await this.carrierService.checkDeliveryFee(
      senderCity,
      recipientCity,
      dto.weightKg || 1,
    );
    const shippingCost = feeEstimation.estimatedFee || 28.0;

    // 3. Check & reserve balance if merchant wallet payment
    if (
      dto.paymentMethod === PaymentMethod.Wallet ||
      dto.paymentMethod === PaymentMethod.Prepaid
    ) {
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

  /**
   * Bulk create shipments for merchant
   */
  async bulkCreateShipments(merchantId: string, dto: BulkCreateOrderDto) {
    const results = [];
    for (const order of dto.orders) {
      try {
        const created = await this.createShipment(merchantId, order);
        results.push({
          success: true,
          trackingNumber: created.trackingNumber,
          id: created.id,
        });
      } catch (err: any) {
        results.push({
          success: false,
          error: err.message,
          deliveryAddressId: order.deliveryAddressId,
        });
      }
    }
    return {
      total: dto.orders.length,
      successful: results.filter((r) => r.success).length,
      orders: results,
    };
  }

  /**
   * Get merchant shipments list with filtering & pagination
   */
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

  /**
   * Get single shipment details
   */
  async getShipmentDetails(shipmentId: string, merchantId?: string) {
    const query = this.shipmentRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.pickupAddress', 'pickupAddress')
      .leftJoinAndSelect('s.deliveryAddress', 'deliveryAddress')
      .leftJoinAndMapOne(
        's.merchant',
        User,
        'merchant',
        'merchant.id = s.merchantId',
      )
      .where('s.id = :shipmentId', { shipmentId })
      .andWhere('s.isDeleted = :isDeleted', { isDeleted: false });

    if (merchantId) {
      query.andWhere('s.merchantId = :merchantId', { merchantId });
    }

    const shipment = await query.getOne();
    if (!shipment) throw new NotFoundException('Shipment not found');
    return shipment;
  }

  /**
   * Update shipment status with audit logging and domain events
   */
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

    if (
      dto.status === ShipmentStatus.Delivered &&
      oldStatus !== ShipmentStatus.Delivered
    ) {
      shipment.deliveredAt = new Date();
      if (
        shipment.paymentMethod === PaymentMethod.COD &&
        shipment.codAmount > 0
      ) {
        shipment.isCodSettled = true;
      }
    }

    if (
      dto.status === ShipmentStatus.Cancelled &&
      oldStatus !== ShipmentStatus.Cancelled
    ) {
      if (shipment.otoOrderId) {
        await this.otoClient.cancelOtoOrder(shipment.otoOrderId);
      }
    }

    const updated = await this.shipmentRepository.save(shipment);

    // Record persistent audit log for state transition
    if (oldStatus !== updated.status || admin) {
      await this.auditService.recordStateTransition(
        updated.id,
        updated.trackingNumber,
        oldStatus,
        updated.status,
        admin || null,
        source ||
          (admin ? 'ADMIN_PORTAL' : merchantId ? 'MERCHANT_PORTAL' : 'SYSTEM'),
        dto.notes,
        {
          paymentMethod: updated.paymentMethod,
          codAmount: updated.codAmount,
          shippingCost: updated.shippingCost,
          carrierName: updated.carrierName,
        },
      );
    }

    // Emit Domain Event
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

  /**
   * Hold shipment
   */
  async holdShipment(
    shipmentId: string,
    merchantId?: string,
    admin?: AuditActor,
  ) {
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
        'Shipment placed on hold',
      );
    }
    return saved;
  }

  /**
   * Unhold shipment
   */
  async unholdShipment(
    shipmentId: string,
    merchantId?: string,
    admin?: AuditActor,
  ) {
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

  /**
   * Cancel shipment (Merchant)
   */
  async cancelShipment(shipmentId: string, merchantId?: string) {
    return this.updateShipmentStatus(
      shipmentId,
      { status: ShipmentStatus.Cancelled, notes: 'Cancelled by merchant' },
      merchantId,
    );
  }

  // ==========================================
  // Address Helper Operations (Delegated)
  // ==========================================

  async fetchAndValidateAddresses(
    pickupAddressId: string,
    deliveryAddressId: string,
  ) {
    return this.addressService.fetchAndValidateAddresses(
      pickupAddressId,
      deliveryAddressId,
    );
  }

  async prepareOtoCreateShipmentPayload(
    pickupAddressId: string,
    deliveryAddressId: string,
    shipmentDetails?: any,
  ) {
    return this.addressService.prepareOtoCreateShipmentPayload(
      pickupAddressId,
      deliveryAddressId,
      shipmentDetails,
    );
  }

  async getMerchantAddressesAdmin(merchantId: string) {
    return this.addressService.getMerchantAddressesAdmin(merchantId);
  }

  async createMerchantAddressAdmin(
    merchantId: string,
    dto: CreateUserAddressDto,
  ) {
    return this.addressService.createMerchantAddressAdmin(merchantId, dto);
  }

  // ==========================================
  // Carrier & OTO Operations (Delegated)
  // ==========================================

  async checkDeliveryFee(dto: DeliveryFeeCheckDto) {
    return this.carrierService.checkDeliveryFee(
      dto.pickupCity,
      dto.deliveryCity,
      dto.weightKg || 1,
    );
  }

  async getDeliveryFeeForOrder(orderId: string) {
    return this.carrierService.getDeliveryFeeForOrder(orderId);
  }

  async createOtoShipment(orderId: string, deliveryOptionId?: string | number) {
    return this.carrierService.createOtoShipment(orderId, deliveryOptionId);
  }

  async selectDeliveryOptionForShipment(
    shipmentId: string,
    merchantId: string,
    deliveryOptionId: string | number,
  ) {
    return this.carrierService.selectDeliveryOptionForShipment(
      shipmentId,
      merchantId,
      deliveryOptionId,
    );
  }

  async selectDeliveryOptionAdmin(
    shipmentId: string,
    deliveryOptionId: string | number,
    admin?: AuditActor,
  ) {
    return this.carrierService.selectDeliveryOptionAdmin(
      shipmentId,
      deliveryOptionId,
      admin,
    );
  }

  async getDeliveryOptionsForShipment(shipmentId: string, merchantId?: string) {
    return this.carrierService.getDeliveryOptionsForShipment(
      shipmentId,
      merchantId,
    );
  }

  async getShipmentLabel(shipmentId: string, merchantId?: string) {
    return this.carrierService.getShipmentLabel(shipmentId, merchantId);
  }

  async syncOtoOrderAdmin(shipmentId: string) {
    return this.carrierService.syncOtoOrderAdmin(shipmentId);
  }

  // ==========================================
  // Tracking (Delegated)
  // ==========================================

  async trackShipment(trackingNumber: string) {
    return this.trackingService.trackShipment(trackingNumber);
  }

  // ==========================================
  // Analytics & Dashboard (Delegated)
  // ==========================================

  async getDashboardOverview(merchantId?: string) {
    return this.analyticsService.getDashboardOverview(merchantId);
  }

  async getShipmentAnalyticsAdmin() {
    return this.analyticsService.getShipmentAnalyticsAdmin();
  }

  // ==========================================
  // Webhooks (Delegated)
  // ==========================================

  async handleOtoWebhook(payload: any, signature: string, rawBody: string) {
    return this.webhookService.handleOtoWebhook(payload, signature, rawBody);
  }

  async getWebhookLogs(pagination: PaginationParamsDto) {
    return this.webhookService.getWebhookLogs(pagination);
  }

  // ==========================================
  // Admin Operations (Delegated)
  // ==========================================

  async getAllShipmentsAdmin(
    pagination: PaginationParamsDto,
    status?: ShipmentStatus,
    searchTerm?: string,
  ) {
    return this.adminService.getAllShipmentsAdmin(
      pagination,
      status,
      searchTerm,
    );
  }

  async createShipmentForMerchantByAdmin(
    dto: AdminCreateShipmentDto,
    admin?: AuditActor,
  ) {
    return this.adminService.createShipmentForMerchantByAdmin(dto, admin);
  }

  async updateCarrierDetailsAdmin(
    shipmentId: string,
    dto: UpdateCarrierDetailsDto,
    admin?: AuditActor,
  ) {
    return this.adminService.updateCarrierDetailsAdmin(shipmentId, dto, admin);
  }

  async bulkUpdateShipmentStatusAdmin(
    dto: BulkUpdateShipmentStatusDto,
    admin?: AuditActor,
  ) {
    return this.adminService.bulkUpdateShipmentStatusAdmin(
      dto,
      admin,
      this.updateShipmentStatus.bind(this),
    );
  }

  // ==========================================
  // Audit History (Delegated)
  // ==========================================

  async getShipmentAuditLogs(
    shipmentId: string,
    pagination?: PaginationParamsDto,
  ) {
    await this.getShipmentDetails(shipmentId);
    return this.auditService.getAuditLogsForShipment(shipmentId, pagination);
  }

  async getAllAuditLogsAdmin(
    pagination?: PaginationParamsDto,
    action?: string,
    adminId?: string,
    shipmentId?: string,
  ) {
    return this.auditService.getAllAuditLogs(
      pagination,
      action,
      adminId,
      shipmentId,
    );
  }

  private generateTrackingNumber(): string {
    const random = Math.floor(10000000 + Math.random() * 90000000);
    return `WSL${random}`;
  }
}
