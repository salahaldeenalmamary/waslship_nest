import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Shipment } from '../entities/shipment.entity';
import { OtoWebhookLog } from '../entities/oto-webhook-log.entity';
import { ShipmentStatus } from '../enums/shipment.enum';
import { OtoClient } from './oto.client';
import { ShipmentAuditService } from './shipment-audit.service';
import { PaginationParamsDto, PagedResult } from '../../../common/dtos/pagination.dto';
import {
  DomainEventNames,
  ShipmentStatusChangedEvent,
  OtoDeliveryWebhookReceivedEvent,
} from '../../../common/events/domain-events';

@Injectable()
export class ShipmentWebhookService {
  private readonly logger = new Logger(ShipmentWebhookService.name);

  constructor(
    @InjectRepository(Shipment)
    private readonly shipmentRepository: Repository<Shipment>,
    @InjectRepository(OtoWebhookLog)
    private readonly webhookLogRepository: Repository<OtoWebhookLog>,
    private readonly otoClient: OtoClient,
    private readonly auditService: ShipmentAuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Process incoming OTO Webhook events and transition internal shipment status
   */
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
      // Support both flat and nested OTO webhook payloads
      const data = payload.data || payload.order || payload.shipment || payload;
      const trackingNumber =
        data.trackingNumber ||
        data.tracking_number ||
        payload.trackingNumber ||
        payload.tracking_number;
      const otoOrderId =
        data.otoId ||
        data.oto_id ||
        data.orderId ||
        data.order_id ||
        payload.otoId ||
        payload.orderId;

      const otoStatus = (
        data.status ||
        data.event ||
        payload.status ||
        payload.event ||
        ''
      ).toLowerCase();

      let newStatus: ShipmentStatus | null = null;

      if (
        otoStatus.includes('delivered') ||
        otoStatus.includes('cash_collected') ||
        otoStatus.includes('cod_collected') ||
        otoStatus.includes('payment_collected') ||
        otoStatus.includes('completed') ||
        otoStatus.includes('paid')
      ) {
        newStatus = ShipmentStatus.Delivered;
      } else if (otoStatus.includes('transit')) {
        newStatus = ShipmentStatus.InTransit;
      } else if (otoStatus.includes('pickup')) {
        newStatus = ShipmentStatus.PickedUp;
      } else if (otoStatus.includes('cancel')) {
        newStatus = ShipmentStatus.Cancelled;
      } else if (otoStatus.includes('return')) {
        newStatus = ShipmentStatus.Returned;
      }

      if (newStatus && (trackingNumber || otoOrderId)) {
        const shipment = await this.shipmentRepository.findOne({
          where: [
            ...(trackingNumber ? [{ trackingNumber }] : []),
            ...(otoOrderId ? [{ otoOrderId: String(otoOrderId) }] : []),
          ],
        });

        if (shipment) {
          const oldStatus = shipment.status;
          shipment.status = newStatus;
          shipment.notes = `Updated via OTO Webhook [${payload.status || payload.event}]`;

          if (newStatus === ShipmentStatus.Delivered && oldStatus !== ShipmentStatus.Delivered) {
            shipment.deliveredAt = new Date();
          }

          const rawCollected =
            data.collectedAmount ??
            data.collected_amount ??
            data.codCollected ??
            data.cod_collected ??
            data.amount_collected ??
            data.amount ??
            data.codAmount ??
            payload.collectedAmount ??
            payload.amount;

          const collectedAmount =
            rawCollected !== undefined && rawCollected !== null && !isNaN(Number(rawCollected))
              ? Number(rawCollected)
              : undefined;

          const carrierName =
            data.deliveryCompany ||
            data.carrierName ||
            data.carrier ||
            payload.deliveryCompany ||
            payload.carrierName;

          const carrierReceiptReference =
            data.receiptNumber ||
            data.receiptReference ||
            payload.receiptReference ||
            payload.receiptNumber;

          if (carrierName && !shipment.carrierName) {
            shipment.carrierName = carrierName;
          }

          const updated = await this.shipmentRepository.save(shipment);

          // Record audit log
          if (oldStatus !== updated.status) {
            await this.auditService.recordStateTransition(
              updated.id,
              updated.trackingNumber,
              oldStatus,
              updated.status,
              null,
              'OTO_WEBHOOK',
              shipment.notes,
              {
                paymentMethod: updated.paymentMethod,
                codAmount: updated.codAmount,
                shippingCost: updated.shippingCost,
                carrierName: updated.carrierName,
              },
            );
          }

          // Emit status changed event
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
              shipment.notes,
              updated.carrierName,
            ),
          );

          // If delivered / cash collected, emit specific OTO delivery webhook event to trigger automated COD settlement pipeline
          if (newStatus === ShipmentStatus.Delivered) {
            this.eventEmitter.emit(
              DomainEventNames.OTO_DELIVERY_WEBHOOK_RECEIVED,
              new OtoDeliveryWebhookReceivedEvent(
                updated.trackingNumber,
                updated.otoOrderId,
                otoStatus,
                true,
                true,
                collectedAmount || updated.codAmount,
                carrierName || updated.carrierName,
                carrierReceiptReference,
                updated.deliveredAt || new Date(),
                payload,
              ),
            );
          }
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

  /**
   * Get paginated OTO webhook integration logs
   */
  async getWebhookLogs(pagination: PaginationParamsDto) {
    const [items, total] = await this.webhookLogRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (pagination.pageNumber - 1) * pagination.pageSize,
      take: pagination.pageSize,
    });
    return new PagedResult(items, total, pagination.pageNumber, pagination.pageSize);
  }
}
