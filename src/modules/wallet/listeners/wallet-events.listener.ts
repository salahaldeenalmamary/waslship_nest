import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  DomainEventNames,
  ShipmentStatusChangedEvent,
} from '../../../common/events/domain-events';
import { ShipmentStatus, PaymentMethod } from '../../shipments/enums/shipment.enum';
import { WalletService } from '../services/wallet.service';
import { AutomatedCodSettlementPipelineService } from '../services/automated-cod-settlement-pipeline.service';

@Injectable()
export class WalletEventsListener {
  private readonly logger = new Logger(WalletEventsListener.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly automatedCodPipeline: AutomatedCodSettlementPipelineService,
  ) {}

  @OnEvent(DomainEventNames.SHIPMENT_STATUS_CHANGED, { async: true })
  async handleShipmentStatusChanged(event: ShipmentStatusChangedEvent) {
    this.logger.log(
      `Received ${DomainEventNames.SHIPMENT_STATUS_CHANGED} for shipment #${event.trackingNumber}: ${event.oldStatus} -> ${event.newStatus}`,
    );

    try {
      // 1. Process COD settlement upon delivery via Automated COD Settlement Pipeline
      if (
        event.newStatus === ShipmentStatus.Delivered &&
        event.oldStatus !== ShipmentStatus.Delivered &&
        event.paymentMethod === PaymentMethod.COD &&
        event.codAmount > 0
      ) {
        this.logger.log(
          `[WalletEventsListener] Triggering Automated COD Settlement Pipeline for delivered shipment #${event.trackingNumber}, COD: ${event.codAmount} SAR`,
        );
        await this.automatedCodPipeline.processSettlementByTrackingNumber(
          event.trackingNumber,
          {
            collectedAmount: event.codAmount,
            carrierName: event.carrierName,
          },
        );
      }

      // 2. Finalize shipping fee deduction for delivered non-COD (prepaid) shipments
      if (
        event.newStatus === ShipmentStatus.Delivered &&
        event.oldStatus !== ShipmentStatus.Delivered &&
        event.paymentMethod !== PaymentMethod.COD &&
        event.shippingCost > 0
      ) {
        this.logger.log(
          `[WalletEventsListener] Finalizing shipping fee deduction for delivered prepaid shipment #${event.trackingNumber}, cost: ${event.shippingCost} SAR`,
        );
        await this.walletService.finalizeShipmentDeduction(
          event.merchantId,
          event.shipmentId,
          event.shippingCost,
          event.trackingNumber,
        );
      }

      // 3. Release reservation if shipment was cancelled
      if (
        event.newStatus === ShipmentStatus.Cancelled &&
        event.oldStatus !== ShipmentStatus.Cancelled
      ) {
        this.logger.log(
          `Releasing reservation for cancelled shipment #${event.trackingNumber}`,
        );
        await this.walletService.releaseShipmentReservation(
          event.merchantId,
          event.shippingCost,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to process wallet update for event ${DomainEventNames.SHIPMENT_STATUS_CHANGED}: ${err.message}`,
        err.stack,
      );
    }
  }
}
