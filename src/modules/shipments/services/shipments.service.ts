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
import { ShipmentStatus, PaymentMethod } from '../enums/shipment.enum';
import {
  CreateShipmentDto,
  BulkCreateOrderDto,
  UpdateShipmentStatusDto,
  DeliveryFeeCheckDto,
  UpdateCarrierDetailsDto,
  BulkUpdateShipmentStatusDto,
} from '../dtos/shipment.dto';
import { OtoClient } from './oto.client';
import { PaginationParamsDto, PagedResult } from '../../../common/dtos/pagination.dto';
import { WalletService } from '../../wallet/services/wallet.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
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
    @InjectRepository(OtoWebhookLog)
    private readonly webhookLogRepository: Repository<OtoWebhookLog>,
    private readonly otoClient: OtoClient,
    private readonly walletService: WalletService,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createShipment(merchantId: string, dto: CreateShipmentDto) {
    const feeEstimation = await this.otoClient.checkDeliveryFee(
      dto.senderCity,
      dto.recipientCity,
      dto.weightKg || 1,
    );
    const shippingCost = feeEstimation.estimatedFee || 28.0;

    // Check & reserve balance if merchant wallet payment
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
    });

    const saved = await this.shipmentRepository.save(shipment);

    // Call OTO Gateway
    const otoRes = await this.otoClient.createOtoOrder(saved);
    if (otoRes && otoRes.otoOrderId) {
      saved.otoOrderId = otoRes.otoOrderId;
      saved.carrierName = otoRes.carrierName;
      saved.carrierTrackingUrl = otoRes.trackingUrl;
      saved.otoDeliveryFee = otoRes.deliveryFee;
      await this.shipmentRepository.save(saved);
    }

    // Emit Domain Event
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
        saved.recipientName,
        saved.recipientCity,
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
        results.push({ success: false, error: err.message, recipient: order.recipientName });
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
      .where('s.merchantId = :merchantId', { merchantId })
      .andWhere('s.isDeleted = :isDeleted', { isDeleted: false });

    if (status) {
      query.andWhere('s.status = :status', { status });
    }

    if (searchTerm) {
      query.andWhere(
        '(s.trackingNumber LIKE :term OR s.recipientName LIKE :term OR s.recipientPhone LIKE :term OR s.senderCity LIKE :term OR s.recipientCity LIKE :term)',
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
      .where('s.isDeleted = :isDeleted', { isDeleted: false });

    if (status) {
      query.andWhere('s.status = :status', { status });
    }

    if (searchTerm) {
      query.andWhere(
        '(s.trackingNumber LIKE :term OR s.recipientName LIKE :term OR s.recipientPhone LIKE :term)',
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

    const shipment = await this.shipmentRepository.findOne({ where: query });
    if (!shipment) throw new NotFoundException('Shipment not found');
    return shipment;
  }

  async trackShipment(trackingNumber: string) {
    const shipment = await this.shipmentRepository.findOne({
      where: { trackingNumber, isDeleted: false },
    });
    if (!shipment) throw new NotFoundException(`Tracking #${trackingNumber} not found`);

    return {
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      carrierName: shipment.carrierName,
      senderCity: shipment.senderCity,
      recipientCity: shipment.recipientCity,
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
  ) {
    const shipment = await this.getShipmentDetails(shipmentId, merchantId);

    const oldStatus = shipment.status;
    shipment.status = dto.status;
    if (dto.notes) shipment.notes = dto.notes;

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

  async holdShipment(shipmentId: string, merchantId?: string) {
    const shipment = await this.getShipmentDetails(shipmentId, merchantId);
    shipment.status = ShipmentStatus.OnHold;
    return this.shipmentRepository.save(shipment);
  }

  async unholdShipment(shipmentId: string, merchantId?: string) {
    const shipment = await this.getShipmentDetails(shipmentId, merchantId);
    if (shipment.status === ShipmentStatus.OnHold) {
      shipment.status = ShipmentStatus.InTransit;
      return this.shipmentRepository.save(shipment);
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
          await this.updateShipmentStatus(shipment.id, {
            status: newStatus,
            notes: `Updated via OTO Webhook [${payload.status}]`,
          });
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

  // --- Additional Admin Shipment Operations ---
  async updateCarrierDetailsAdmin(shipmentId: string, dto: UpdateCarrierDetailsDto) {
    const shipment = await this.getShipmentDetails(shipmentId);
    if (dto.carrierName !== undefined) shipment.carrierName = dto.carrierName;
    if (dto.carrierTrackingUrl !== undefined) shipment.carrierTrackingUrl = dto.carrierTrackingUrl;
    if (dto.otoOrderId !== undefined) shipment.otoOrderId = dto.otoOrderId;
    if (dto.otoDeliveryFee !== undefined) shipment.otoDeliveryFee = dto.otoDeliveryFee;
    return this.shipmentRepository.save(shipment);
  }

  async bulkUpdateShipmentStatusAdmin(dto: BulkUpdateShipmentStatusDto) {
    const updatedShipments = [];
    const errors = [];

    for (const shipmentId of dto.shipmentIds) {
      try {
        const updated = await this.updateShipmentStatus(shipmentId, {
          status: dto.status,
          notes: dto.notes || 'Bulk status update by administrator',
        });
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
