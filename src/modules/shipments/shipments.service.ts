import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shipment } from './entities/shipment.entity';
import { OtoWebhookLog } from './entities/oto-webhook-log.entity';
import { ShipmentStatus, PaymentMethod } from './enums/shipment.enum';
import {
  CreateShipmentDto,
  BulkCreateOrderDto,
  UpdateShipmentStatusDto,
  DeliveryFeeCheckDto,
} from './dtos/shipment.dto';
import { OtoClient } from './services/oto.client';
import { PaginationParamsDto, PagedResult } from '../../common/dtos/pagination.dto';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification.enum';

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

    // Send Notification
    await this.notificationsService.sendNotification({
      userId: merchantId,
      title: 'Shipment Created',
      body: `Shipment #${saved.trackingNumber} has been created and assigned.`,
      type: NotificationType.ShipmentCreated,
      data: { shipmentId: saved.id, trackingNumber: saved.trackingNumber },
    });

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
      // If COD, credit COD amount to merchant wallet or record pending settlement
      if (shipment.paymentMethod === PaymentMethod.COD && shipment.codAmount > 0 && !shipment.isCodSettled) {
        await this.walletService.processCodSettlement(
          shipment.merchantId,
          shipment.id,
          shipment.codAmount,
          shipment.shippingCost,
        );
        shipment.isCodSettled = true;
      }
    }

    if (dto.status === ShipmentStatus.Cancelled && oldStatus !== ShipmentStatus.Cancelled) {
      // Release balance reservation if needed
      await this.walletService.releaseShipmentReservation(
        shipment.merchantId,
        shipment.shippingCost,
      );
      if (shipment.otoOrderId) {
        await this.otoClient.cancelOtoOrder(shipment.otoOrderId);
      }
    }

    const updated = await this.shipmentRepository.save(shipment);

    // Notify user
    await this.notificationsService.sendNotification({
      userId: shipment.merchantId,
      title: `Shipment ${dto.status}`,
      body: `Shipment #${shipment.trackingNumber} is now ${dto.status}.`,
      type: NotificationType.ShipmentStatusChanged,
      data: { shipmentId: shipment.id, status: dto.status },
    });

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

  private generateTrackingNumber(): string {
    const random = Math.floor(10000000 + Math.random() * 90000000);
    return `WSL${random}`;
  }
}
