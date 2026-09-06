import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Wallet } from '../entities/wallet.entity';
import { WalletTransaction } from '../entities/transaction.entity';
import {
  CodReceiptReconciliation,
  CodReconciliationLineItem,
} from '../entities/cod-receipt-reconciliation.entity';
import { Shipment } from '../../shipments/entities/shipment.entity';
import { PaymentMethod, ShipmentStatus } from '../../shipments/enums/shipment.enum';
import {
  TransactionStatus,
  TransactionType,
  CodReconciliationStatus,
} from '../enums/wallet.enum';
import { WalletService } from './wallet.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { NotificationType } from '../../notifications/enums/notification.enum';
import {
  DomainEventNames,
  OtoDeliveryWebhookReceivedEvent,
  ShipmentStatusChangedEvent,
  WalletCreditedEvent,
  CodSettledEvent,
} from '../../../common/events/domain-events';
import { SimulateOtoWebhookDeliveryDto } from '../dtos/cod-settlement.dto';

export interface AutomatedSettlementResult {
  success: boolean;
  alreadySettled?: boolean;
  message: string;
  trackingNumber: string;
  shipmentId?: string;
  merchantId?: string;
  collectedAmount?: number;
  expectedCodAmount?: number;
  shippingCost?: number;
  netCredited?: number;
  hasDiscrepancy?: boolean;
  discrepancyAmount?: number;
  walletTransactionId?: string;
  newBalance?: number;
  carrierName?: string;
  processedAt: Date;
}

@Injectable()
export class AutomatedCodSettlementPipelineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomatedCodSettlementPipelineService.name);
  private backgroundJobTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
    @InjectRepository(Shipment)
    private readonly shipmentRepository: Repository<Shipment>,
    @InjectRepository(CodReceiptReconciliation)
    private readonly reconciliationRepository: Repository<CodReceiptReconciliation>,
    private readonly walletService: WalletService,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    this.logger.log(
      '[Automated COD Pipeline] Background reconciliation service initialized for OTO transitions',
    );
    // Initial sweep 5 seconds after startup
    setTimeout(() => {
      this.runBackgroundReconciliationJob().catch((err) => {
        this.logger.error(
          `[Automated COD Pipeline] Initial background reconciliation failed: ${err.message}`,
        );
      });
    }, 5000);

    // Recurring background job every 10 minutes to auto-settle any delivered COD shipments
    this.backgroundJobTimer = setInterval(() => {
      this.runBackgroundReconciliationJob().catch((err) => {
        this.logger.error(
          `[Automated COD Pipeline] Periodic background reconciliation failed: ${err.message}`,
        );
      });
    }, 10 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.backgroundJobTimer) {
      clearInterval(this.backgroundJobTimer);
    }
  }

  /**
   * Background job: Scans and auto-settles any delivered COD shipments from OTO transitions
   * that have not yet been credited to the merchant wallet.
   */
  async runBackgroundReconciliationJob(): Promise<{ processedCount: number; settledCount: number }> {
    try {
      const pendingShipments = await this.shipmentRepository.find({
        where: {
          status: ShipmentStatus.Delivered,
          paymentMethod: PaymentMethod.COD,
          isCodSettled: false,
          isDeleted: false,
        },
        take: 100,
      });

      if (!pendingShipments.length) {
        return { processedCount: 0, settledCount: 0 };
      }

      this.logger.log(
        `[Automated COD Pipeline] Background job detected ${pendingShipments.length} delivered COD shipments pending settlement. Auto-reconciling...`,
      );

      let settledCount = 0;
      for (const shipment of pendingShipments) {
        if (Number(shipment.codAmount) > 0) {
          const result = await this.executeSettlementForShipment({
            shipment,
            collectedAmount: Number(shipment.codAmount),
            carrierName: shipment.carrierName,
          });
          if (result.success && !result.alreadySettled) {
            settledCount++;
          }
        }
      }

      if (settledCount > 0) {
        this.logger.log(
          `[Automated COD Pipeline] Background job completed: settled ${settledCount}/${pendingShipments.length} shipments.`,
        );
      }

      return { processedCount: pendingShipments.length, settledCount };
    } catch (err: any) {
      this.logger.error(
        `[Automated COD Pipeline] Error in background reconciliation job: ${err.message}`,
        err.stack,
      );
      return { processedCount: 0, settledCount: 0 };
    }
  }

  /**
   * Primary event listener: triggered whenever an OTO delivery or cash collection webhook is verified
   */
  @OnEvent(DomainEventNames.OTO_DELIVERY_WEBHOOK_RECEIVED, { async: true })
  async handleOtoWebhookReceived(event: OtoDeliveryWebhookReceivedEvent) {
    this.logger.log(
      `[Automated COD Pipeline] Handling OTO delivery webhook event for tracking #${event.trackingNumber}, status: ${event.status}`,
    );

    try {
      await this.processSettlementByTrackingNumber(event.trackingNumber, {
        collectedAmount: event.collectedAmount,
        carrierName: event.carrierName,
        carrierReceiptReference: event.carrierReceiptReference,
        deliveryDate: event.deliveryDate,
        rawWebhookPayload: event.rawPayload,
      });
    } catch (err: any) {
      this.logger.error(
        `[Automated COD Pipeline] Error processing OTO webhook event for #${event.trackingNumber}: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Fallback event listener: triggered when shipment transitions to Delivered status
   */
  @OnEvent(DomainEventNames.SHIPMENT_STATUS_CHANGED, { async: true })
  async handleShipmentStatusChanged(event: ShipmentStatusChangedEvent) {
    if (
      event.newStatus === ShipmentStatus.Delivered &&
      event.paymentMethod === PaymentMethod.COD &&
      event.codAmount > 0
    ) {
      this.logger.log(
        `[Automated COD Pipeline] Shipment #${event.trackingNumber} status transitioned to Delivered. Verifying COD settlement...`,
      );

      try {
        await this.processSettlementByTrackingNumber(event.trackingNumber, {
          collectedAmount: event.codAmount,
          carrierName: event.carrierName,
        });
      } catch (err: any) {
        this.logger.error(
          `[Automated COD Pipeline] Status change fallback failed for #${event.trackingNumber}: ${err.message}`,
          err.stack,
        );
      }
    }
  }

  /**
   * Direct payload processing method for incoming OTO webhooks
   * Extracts parameters and executes pipeline
   */
  async processOtoWebhookPayload(
    payload: any,
    _rawBody?: string,
  ): Promise<AutomatedSettlementResult> {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Invalid OTO webhook payload structure');
    }

    // Support both flat and nested OTO payload structures
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

    const rawStatus = (
      data.status ||
      data.event ||
      payload.status ||
      payload.event ||
      ''
    ).toLowerCase();

    // Check if status indicates delivery or cash collection
    const isDeliveryOrCashCollected =
      rawStatus.includes('delivered') ||
      rawStatus.includes('cash_collected') ||
      rawStatus.includes('cod_collected') ||
      rawStatus.includes('payment_collected') ||
      rawStatus.includes('collected') ||
      rawStatus.includes('completed') ||
      rawStatus.includes('paid');

    if (!isDeliveryOrCashCollected) {
      this.logger.debug(
        `[Automated COD Pipeline] Webhook status [${rawStatus}] is not a delivery or cash collection event. Skipping settlement.`,
      );
      return {
        success: true,
        message: `Status [${rawStatus}] is not a cash collection or delivery event.`,
        trackingNumber: trackingNumber || otoOrderId || 'UNKNOWN',
        processedAt: new Date(),
      };
    }

    // Extract collected amount if present in payload
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
      data.delivery_company ||
      data.carrierName ||
      data.carrier ||
      payload.deliveryCompany ||
      payload.carrier;

    const carrierReceiptReference =
      data.receiptNumber ||
      data.receiptReference ||
      data.otoTransactionId ||
      payload.receiptReference ||
      payload.receipt;

    const deliveryDate =
      data.deliveryDate || data.deliveredAt || payload.deliveryDate || payload.deliveredAt
        ? new Date(data.deliveryDate || data.deliveredAt || payload.deliveryDate || payload.deliveredAt)
        : new Date();

    // Look up shipment by tracking number or OTO order id
    let shipment: Shipment | null = null;
    if (trackingNumber) {
      shipment = await this.shipmentRepository.findOne({
        where: { trackingNumber, isDeleted: false },
      });
    }

    if (!shipment && otoOrderId) {
      shipment = await this.shipmentRepository.findOne({
        where: { otoOrderId: String(otoOrderId), isDeleted: false },
      });
    }

    if (!shipment) {
      this.logger.warn(
        `[Automated COD Pipeline] No matching shipment found for trackingNumber='${trackingNumber}' or otoOrderId='${otoOrderId}'. Recording unmatched audit log.`,
      );
      return {
        success: false,
        message: `Shipment not found for tracking #${trackingNumber || otoOrderId}`,
        trackingNumber: trackingNumber || String(otoOrderId) || 'UNKNOWN',
        processedAt: new Date(),
      };
    }

    return this.executeSettlementForShipment({
      shipment,
      collectedAmount,
      carrierName: carrierName || shipment.carrierName,
      carrierReceiptReference,
      deliveryDate,
      rawWebhookPayload: payload,
    });
  }

  /**
   * Helper to process settlement by tracking number
   */
  async processSettlementByTrackingNumber(
    trackingNumber: string,
    options: {
      collectedAmount?: number;
      carrierName?: string;
      carrierReceiptReference?: string;
      deliveryDate?: Date;
      rawWebhookPayload?: any;
    } = {},
  ): Promise<AutomatedSettlementResult> {
    const shipment = await this.shipmentRepository.findOne({
      where: { trackingNumber, isDeleted: false },
    });

    if (!shipment) {
      throw new NotFoundException(`Shipment with tracking #${trackingNumber} not found.`);
    }

    return this.executeSettlementForShipment({
      shipment,
      collectedAmount: options.collectedAmount,
      carrierName: options.carrierName || shipment.carrierName,
      carrierReceiptReference: options.carrierReceiptReference,
      deliveryDate: options.deliveryDate,
      rawWebhookPayload: options.rawWebhookPayload,
    });
  }

  /**
   * Core atomic execution engine for settling COD funds into merchant wallet
   */
  async executeSettlementForShipment(params: {
    shipment: Shipment;
    collectedAmount?: number;
    carrierName?: string;
    carrierReceiptReference?: string;
    deliveryDate?: Date;
    rawWebhookPayload?: any;
  }): Promise<AutomatedSettlementResult> {
    const { shipment } = params;

    // 1. Validate payment method
    if (shipment.paymentMethod !== PaymentMethod.COD || Number(shipment.codAmount) <= 0) {
      this.logger.log(
        `[Automated COD Pipeline] Shipment #${shipment.trackingNumber} is not a COD shipment (method: ${shipment.paymentMethod}, COD: ${shipment.codAmount}). Skipping settlement.`,
      );
      return {
        success: true,
        message: 'Shipment is not Cash-on-Delivery. No COD settlement needed.',
        trackingNumber: shipment.trackingNumber,
        shipmentId: shipment.id,
        merchantId: shipment.merchantId,
        processedAt: new Date(),
      };
    }

    // 2. Strict Idempotency Check: Prevent duplicate credit
    const existingTx = await this.transactionRepository.findOne({
      where: {
        referenceId: shipment.id,
        type: TransactionType.CODSettlement,
        status: TransactionStatus.Completed,
        isDeleted: false,
      },
    });

    if (existingTx) {
      this.logger.warn(
        `[Automated COD Pipeline] Idempotency guard triggered: Shipment #${shipment.trackingNumber} COD was already settled in transaction ${existingTx.id}. Skipping duplicate credit.`,
      );

      // Ensure shipment flag is properly aligned
      if (!shipment.isCodSettled) {
        shipment.isCodSettled = true;
        await this.shipmentRepository.save(shipment);
      }

      return {
        success: true,
        alreadySettled: true,
        message: 'Shipment COD has already been settled previously.',
        trackingNumber: shipment.trackingNumber,
        shipmentId: shipment.id,
        merchantId: shipment.merchantId,
        walletTransactionId: existingTx.id,
        netCredited: existingTx.amount,
        processedAt: new Date(),
      };
    }

    // 3. Compute Financial Breakdown
    const expectedCod = Number(shipment.codAmount || 0);
    const collectedAmount =
      params.collectedAmount !== undefined && params.collectedAmount !== null
        ? Number(params.collectedAmount)
        : expectedCod;

    const shippingCost = Number(shipment.shippingCost || 0);
    const netCredit = Math.max(0, collectedAmount - shippingCost);

    const discrepancyAmount = Math.abs(collectedAmount - expectedCod);
    const hasDiscrepancy = discrepancyAmount > 0.01;

    if (hasDiscrepancy) {
      this.logger.warn(
        `[Automated COD Pipeline] Discrepancy detected for shipment #${shipment.trackingNumber}: Courier collected ${collectedAmount} SAR vs expected ${expectedCod} SAR. Discrepancy: ${discrepancyAmount} SAR.`,
      );
    }

    // 4. Update Merchant Wallet Balance
    const wallet = await this.walletService.getOrCreateWallet(shipment.merchantId);

    wallet.balance = Number((wallet.balance + netCredit).toFixed(2));
    // Release shipping cost reservation if held
    wallet.reservedBalance = Math.max(
      0,
      Number((wallet.reservedBalance - shippingCost).toFixed(2)),
    );
    // Deduct pending COD balance
    wallet.pendingCodBalance = Math.max(
      0,
      Number((wallet.pendingCodBalance - expectedCod).toFixed(2)),
    );

    const savedWallet = await this.walletRepository.save(wallet);

    // 5. Create immutable WalletTransaction ledger entry
    const carrierName = params.carrierName || shipment.carrierName || 'OTO Carrier';
    const txDescription = `Automated COD Settlement via OTO Webhook #${shipment.trackingNumber} (${carrierName}): Collected ${collectedAmount.toFixed(2)} SAR, Shipping Cost ${shippingCost.toFixed(2)} SAR`;

    const tx = this.transactionRepository.create({
      walletId: savedWallet.id,
      merchantId: shipment.merchantId,
      amount: netCredit,
      type: TransactionType.CODSettlement,
      status: TransactionStatus.Completed,
      referenceId: shipment.id,
      description: txDescription,
      currency: 'SAR',
    });
    const savedTx = await this.transactionRepository.save(tx);

    // 6. Update Shipment State
    shipment.status = ShipmentStatus.Delivered;
    shipment.deliveredAt = params.deliveryDate || shipment.deliveredAt || new Date();
    shipment.isCodSettled = true;
    if (params.carrierName) {
      shipment.carrierName = params.carrierName;
    }
    const settlementNote = `[Automated COD Settlement] Settled ${netCredit.toFixed(2)} SAR (Collected ${collectedAmount.toFixed(2)} SAR, Fee: ${shippingCost.toFixed(2)} SAR) via OTO Webhook at ${new Date().toISOString()}`;
    shipment.notes = shipment.notes
      ? `${shipment.notes} | ${settlementNote}`
      : settlementNote;

    await this.shipmentRepository.save(shipment);

    // 7. Record in CodReceiptReconciliation audit batch
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const batchRef = `AUTO-OTO-${todayStr}`;

      let reconciliation = await this.reconciliationRepository.findOne({
        where: { batchNumber: batchRef },
      });

      const lineItem: CodReconciliationLineItem = {
        trackingNumber: shipment.trackingNumber,
        shipmentId: shipment.id,
        otoOrderId: shipment.otoOrderId || undefined,
        merchantId: shipment.merchantId,
        courierCollectedAmount: collectedAmount,
        expectedCodAmount: expectedCod,
        shippingCostDeducted: shippingCost,
        netCreditedToWallet: netCredit,
        carrierCode: carrierName,
        carrierReceiptReference: params.carrierReceiptReference || `OTO-${shipment.otoOrderId || shipment.trackingNumber}`,
        status: hasDiscrepancy ? 'DISCREPANCY' : 'MATCHED',
        walletTransactionId: savedTx.id,
        notes: hasDiscrepancy
          ? `Courier collected ${collectedAmount} SAR vs expected order COD of ${expectedCod} SAR`
          : undefined,
      };

      if (!reconciliation) {
        reconciliation = this.reconciliationRepository.create({
          batchNumber: batchRef,
          carrierCode: carrierName,
          status: hasDiscrepancy
            ? CodReconciliationStatus.CompletedWithDiscrepancies
            : CodReconciliationStatus.Completed,
          totalReceipts: 1,
          matchedReceipts: hasDiscrepancy ? 0 : 1,
          discrepancyReceipts: hasDiscrepancy ? 1 : 0,
          unmatchedReceipts: 0,
          totalCollectedCod: collectedAmount,
          totalShippingFeesDeducted: shippingCost,
          totalNetCredited: netCredit,
          currency: 'SAR',
          reconciledBy: 'SYSTEM_OTO_WEBHOOK_PIPELINE',
          notes: 'Automated daily OTO delivery webhook COD reconciliation batch',
          lineItems: [lineItem],
        });
      } else {
        reconciliation.totalReceipts += 1;
        if (hasDiscrepancy) {
          reconciliation.discrepancyReceipts += 1;
          reconciliation.status = CodReconciliationStatus.CompletedWithDiscrepancies;
        } else {
          reconciliation.matchedReceipts += 1;
        }
        reconciliation.totalCollectedCod = Number(
          (reconciliation.totalCollectedCod + collectedAmount).toFixed(2),
        );
        reconciliation.totalShippingFeesDeducted = Number(
          (reconciliation.totalShippingFeesDeducted + shippingCost).toFixed(2),
        );
        reconciliation.totalNetCredited = Number(
          (reconciliation.totalNetCredited + netCredit).toFixed(2),
        );
        reconciliation.lineItems = [...(reconciliation.lineItems || []), lineItem];
      }

      await this.reconciliationRepository.save(reconciliation);
    } catch (auditErr: any) {
      this.logger.error(
        `[Automated COD Pipeline] Failed to log reconciliation batch entry for #${shipment.trackingNumber}: ${auditErr.message}`,
      );
    }

    // 8. Real-time Merchant Notification
    try {
      await this.notificationsService.sendNotification({
        userId: shipment.merchantId,
        title: 'Cash on Delivery Collected & Credited',
        body: `Shipment #${shipment.trackingNumber} has been delivered. Cash of ${collectedAmount.toFixed(2)} SAR was collected by ${carrierName}, and net ${netCredit.toFixed(2)} SAR has been automatically credited to your wallet balance.`,
        type: NotificationType.WalletCredited,
      });
    } catch (notifyErr: any) {
      this.logger.warn(
        `[Automated COD Pipeline] Could not dispatch merchant notification: ${notifyErr.message}`,
      );
    }

    // 9. Emit Domain Events
    this.eventEmitter.emit(
      DomainEventNames.WALLET_CREDITED,
      new WalletCreditedEvent(
        shipment.merchantId,
        savedWallet.id,
        netCredit,
        TransactionType.CODSettlement,
        shipment.id,
        txDescription,
      ),
    );

    this.eventEmitter.emit(
      DomainEventNames.COD_SETTLED,
      new CodSettledEvent(
        shipment.id,
        shipment.merchantId,
        shipment.trackingNumber,
        collectedAmount,
        shippingCost,
        netCredit,
        savedWallet.balance,
        carrierName,
        savedTx.id,
        'OTO_WEBHOOK',
      ),
    );

    this.logger.log(
      `[Automated COD Pipeline] Successfully settled COD for shipment #${shipment.trackingNumber}: +${netCredit.toFixed(2)} SAR credited to merchant ${shipment.merchantId}. New balance: ${savedWallet.balance} SAR.`,
    );

    return {
      success: true,
      message: `COD settlement successfully completed for shipment #${shipment.trackingNumber}.`,
      trackingNumber: shipment.trackingNumber,
      shipmentId: shipment.id,
      merchantId: shipment.merchantId,
      collectedAmount,
      expectedCodAmount: expectedCod,
      shippingCost,
      netCredited: netCredit,
      hasDiscrepancy,
      discrepancyAmount,
      walletTransactionId: savedTx.id,
      newBalance: savedWallet.balance,
      carrierName,
      processedAt: new Date(),
    };
  }

  /**
   * Pipeline simulation / testing method for merchants & admins
   */
  async simulateOtoWebhookDelivery(
    dto: SimulateOtoWebhookDeliveryDto,
  ): Promise<AutomatedSettlementResult> {
    const shipment = await this.shipmentRepository.findOne({
      where: [
        { trackingNumber: dto.trackingNumber, isDeleted: false },
        ...(dto.otoOrderId
          ? [{ otoOrderId: dto.otoOrderId, isDeleted: false }]
          : []),
      ],
    });

    if (!shipment) {
      throw new NotFoundException(
        `Shipment with tracking #${dto.trackingNumber} not found`,
      );
    }

    return this.executeSettlementForShipment({
      shipment,
      collectedAmount: dto.collectedAmount,
      carrierName: dto.carrierName,
      carrierReceiptReference: dto.carrierReceiptReference,
      deliveryDate: new Date(),
      rawWebhookPayload: {
        event: 'order.delivered',
        status: dto.status || 'delivered',
        ...dto,
      },
    });
  }

  /**
   * Retrieves high-level pipeline metrics
   */
  async getPipelineMetrics(merchantId?: string) {
    const shipmentQuery = this.shipmentRepository
      .createQueryBuilder('s')
      .where('s.paymentMethod = :method', { method: PaymentMethod.COD })
      .andWhere('s.isDeleted = false');

    if (merchantId) {
      shipmentQuery.andWhere('s.merchantId = :merchantId', { merchantId });
    }

    const totalCodShipments = await shipmentQuery.getCount();

    const deliveredCodShipments = await shipmentQuery
      .clone()
      .andWhere('s.status = :status', { status: ShipmentStatus.Delivered })
      .getCount();

    const settledCodShipments = await shipmentQuery
      .clone()
      .andWhere('s.isCodSettled = true')
      .getCount();

    const pendingSettlementCount = await shipmentQuery
      .clone()
      .andWhere('s.status = :status', { status: ShipmentStatus.Delivered })
      .andWhere('s.isCodSettled = false')
      .getCount();

    // Aggregate monetary amounts from transactions
    const txQuery = this.transactionRepository
      .createQueryBuilder('tx')
      .select('SUM(tx.amount)', 'totalCredited')
      .addSelect('COUNT(tx.id)', 'txCount')
      .where('tx.type = :type', { type: TransactionType.CODSettlement })
      .andWhere('tx.status = :status', { status: TransactionStatus.Completed })
      .andWhere('tx.isDeleted = false');

    if (merchantId) {
      txQuery.andWhere('tx.merchantId = :merchantId', { merchantId });
    }

    const txStats = await txQuery.getRawOne();

    // Recent pipeline settlements
    const recentSettlements = await this.transactionRepository.find({
      where: {
        type: TransactionType.CODSettlement,
        status: TransactionStatus.Completed,
        isDeleted: false,
        ...(merchantId ? { merchantId } : {}),
      },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    return {
      totalCodShipments,
      deliveredCodShipments,
      settledCodShipments,
      pendingSettlementCount,
      totalNetCreditedToWallet: Number(txStats?.totalCredited || 0),
      totalSettlementTransactions: Number(txStats?.txCount || 0),
      recentSettlements,
      pipelineStatus: 'ACTIVE',
      listenerMode: 'REALTIME_WEBHOOK_EVENT_DRIVEN',
    };
  }
}
