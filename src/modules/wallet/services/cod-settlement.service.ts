import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CodReceiptReconciliation,
  CodReconciliationLineItem,
} from '../entities/cod-receipt-reconciliation.entity';
import { Shipment } from '../../shipments/entities/shipment.entity';
import { ShipmentStatus, PaymentMethod } from '../../shipments/enums/shipment.enum';
import { CodReconciliationStatus } from '../enums/wallet.enum';
import {
  ReconcileCodBatchDto,
  ReconcileCodReceiptItemDto,
  AutoReconcileDeliveredShipmentsDto,
} from '../dtos/cod-settlement.dto';
import { WalletService } from './wallet.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { NotificationType } from '../../notifications/enums/notification.enum';
import { PaginationParamsDto, PagedResult } from '../../../common/dtos/pagination.dto';
import {
  DomainEventNames,
  ShipmentStatusChangedEvent,
} from '../../../common/events/domain-events';

@Injectable()
export class CodSettlementService {
  private readonly logger = new Logger(CodSettlementService.name);

  constructor(
    @InjectRepository(CodReceiptReconciliation)
    private readonly reconciliationRepository: Repository<CodReceiptReconciliation>,
    @InjectRepository(Shipment)
    private readonly shipmentRepository: Repository<Shipment>,
    private readonly walletService: WalletService,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Automated reconciliation service that processes courier COD receipts and directly credits merchant wallet balances
   */
  async processCourierReceiptsReconciliation(
    dto: ReconcileCodBatchDto,
    actorId = 'SYSTEM_AUTO_PIPELINE',
  ): Promise<{
    isSuccess: boolean;
    batchNumber: string;
    carrierCode: string;
    totalReceipts: number;
    matchedReceipts: number;
    discrepancyReceipts: number;
    unmatchedReceipts: number;
    totalCollectedCod: number;
    totalShippingFeesDeducted: number;
    totalNetCredited: number;
    status: CodReconciliationStatus;
    lineItems: CodReconciliationLineItem[];
  }> {
    const batchNumber =
      dto.batchReference ||
      `COD-REC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const carrierCode = dto.carrierCode || 'OTO';
    const autoDeliver = dto.autoDeliverShipments !== false;
    const deductShipping = dto.deductShippingFees !== false;

    let matchedCount = 0;
    let discrepancyCount = 0;
    let unmatchedCount = 0;
    let totalCollected = 0;
    let totalShippingDeducted = 0;
    let totalNetCredited = 0;

    const lineItems: CodReconciliationLineItem[] = [];

    for (const receipt of dto.receipts) {
      const tracking = receipt.trackingNumber.trim();
      const shipment = await this.shipmentRepository.findOne({
        where: [{ trackingNumber: tracking }, { otoOrderId: tracking }],
      });

      if (!shipment) {
        unmatchedCount++;
        lineItems.push({
          trackingNumber: tracking,
          courierCollectedAmount: receipt.collectedAmount,
          expectedCodAmount: 0,
          shippingCostDeducted: 0,
          netCreditedToWallet: 0,
          carrierCode: receipt.carrierCode || carrierCode,
          carrierReceiptReference: receipt.carrierReceiptReference,
          status: 'NOT_FOUND',
          notes: 'No shipment matching trackingNumber or OTO orderId in database',
        });
        continue;
      }

      if (shipment.isCodSettled) {
        lineItems.push({
          trackingNumber: shipment.trackingNumber,
          shipmentId: shipment.id,
          otoOrderId: shipment.otoOrderId,
          merchantId: shipment.merchantId,
          courierCollectedAmount: receipt.collectedAmount,
          expectedCodAmount: shipment.codAmount,
          shippingCostDeducted: 0,
          netCreditedToWallet: 0,
          carrierCode: receipt.carrierCode || carrierCode,
          carrierReceiptReference: receipt.carrierReceiptReference,
          status: 'ALREADY_SETTLED',
          notes: 'Shipment COD was already previously settled to merchant wallet',
        });
        continue;
      }

      // Check for discrepancies between courier remittance and expected COD amount
      const expectedAmount = Number(shipment.codAmount || 0);
      const collectedAmount = Number(receipt.collectedAmount || 0);
      const diff = Math.abs(collectedAmount - expectedAmount);
      const hasDiscrepancy = diff > 0.01;

      if (hasDiscrepancy) {
        discrepancyCount++;
      } else {
        matchedCount++;
      }

      const shippingCost = deductShipping ? Number(shipment.shippingCost || 0) : 0;
      const netCredit = Math.max(0, collectedAmount - shippingCost);

      // Execute Direct Merchant Wallet Credit
      await this.walletService.processCodSettlement(
        shipment.merchantId,
        shipment.id,
        collectedAmount,
        shippingCost,
      );

      // Transition shipment status & mark settled
      const oldStatus = shipment.status;
      shipment.isCodSettled = true;
      if (autoDeliver && shipment.status !== ShipmentStatus.Delivered) {
        shipment.status = ShipmentStatus.Delivered;
        shipment.deliveredAt = receipt.deliveryDate ? new Date(receipt.deliveryDate) : new Date();
      }
      shipment.notes = `${shipment.notes ? `${shipment.notes} | ` : ''}COD Settled via Batch #${batchNumber}`;
      await this.shipmentRepository.save(shipment);

      // Trigger status changed event if status transitioned
      if (oldStatus !== shipment.status) {
        this.eventEmitter.emit(
          DomainEventNames.SHIPMENT_STATUS_CHANGED,
          new ShipmentStatusChangedEvent(
            shipment.id,
            shipment.merchantId,
            shipment.trackingNumber,
            oldStatus,
            shipment.status,
            shipment.paymentMethod,
            shipment.codAmount,
            shipment.shippingCost,
            shipment.notes,
            shipment.carrierName || carrierCode,
          ),
        );
      }

      // Dispatch direct financial notification to the merchant
      await this.notificationsService.sendNotification({
        userId: shipment.merchantId,
        title: 'COD Settlement Credited',
        body: `Shipment #${shipment.trackingNumber} COD remittance reconciled: ${collectedAmount.toFixed(2)} SAR collected, net ${netCredit.toFixed(2)} SAR credited to your wallet balance.`,
        type: NotificationType.WalletCredited,
      });

      totalCollected += collectedAmount;
      totalShippingDeducted += shippingCost;
      totalNetCredited += netCredit;

      lineItems.push({
        trackingNumber: shipment.trackingNumber,
        shipmentId: shipment.id,
        otoOrderId: shipment.otoOrderId,
        merchantId: shipment.merchantId,
        courierCollectedAmount: collectedAmount,
        expectedCodAmount: expectedAmount,
        shippingCostDeducted: shippingCost,
        netCreditedToWallet: netCredit,
        carrierCode: receipt.carrierCode || carrierCode,
        carrierReceiptReference: receipt.carrierReceiptReference,
        status: hasDiscrepancy ? 'DISCREPANCY' : 'MATCHED',
        notes: hasDiscrepancy
          ? `Discrepancy detected: Courier collected ${collectedAmount} SAR vs expected ${expectedAmount} SAR`
          : 'Exact COD match reconciled & credited',
      });
    }

    const batchStatus =
      discrepancyCount > 0 || unmatchedCount > 0
        ? CodReconciliationStatus.CompletedWithDiscrepancies
        : CodReconciliationStatus.Completed;

    const batchRecord = this.reconciliationRepository.create({
      batchNumber,
      carrierCode,
      status: batchStatus,
      totalReceipts: dto.receipts.length,
      matchedReceipts: matchedCount,
      discrepancyReceipts: discrepancyCount,
      unmatchedReceipts: unmatchedCount,
      totalCollectedCod: totalCollected,
      totalShippingFeesDeducted: totalShippingDeducted,
      totalNetCredited: totalNetCredited,
      currency: 'SAR',
      reconciledBy: actorId,
      notes: dto.notes || `Reconciliation batch for ${carrierCode} courier receipts`,
      lineItems,
    });

    await this.reconciliationRepository.save(batchRecord);

    this.logger.log(
      `COD Settlement Batch #${batchNumber} complete: ${matchedCount} matched, ${discrepancyCount} discrepancies, ${unmatchedCount} unmatched. Total net credited: ${totalNetCredited.toFixed(2)} SAR`,
    );

    return {
      isSuccess: true,
      batchNumber,
      carrierCode,
      totalReceipts: dto.receipts.length,
      matchedReceipts: matchedCount,
      discrepancyReceipts: discrepancyCount,
      unmatchedReceipts: unmatchedCount,
      totalCollectedCod: Number(totalCollected.toFixed(2)),
      totalShippingFeesDeducted: Number(totalShippingDeducted.toFixed(2)),
      totalNetCredited: Number(totalNetCredited.toFixed(2)),
      status: batchStatus,
      lineItems,
    };
  }

  /**
   * Automated Pipeline Run: Automatically scans and reconciles all delivered COD shipments pending settlement
   */
  async runAutomatedPipelineForDeliveredShipments(
    dto: AutoReconcileDeliveredShipmentsDto = {},
    actorId = 'SYSTEM_AUTO_CRON',
  ) {
    const query = this.shipmentRepository
      .createQueryBuilder('s')
      .where('s.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('s.status = :status', { status: ShipmentStatus.Delivered })
      .andWhere('s.paymentMethod = :paymentMethod', {
        paymentMethod: PaymentMethod.COD,
      })
      .andWhere('s.isCodSettled = :isCodSettled', { isCodSettled: false })
      .andWhere('s.codAmount > 0');

    if (dto.carrierCode) {
      query.andWhere('LOWER(s.carrierName) LIKE LOWER(:carrier)', {
        carrier: `%${dto.carrierCode}%`,
      });
    }

    if (dto.merchantId) {
      query.andWhere('s.merchantId = :merchantId', {
        merchantId: dto.merchantId,
      });
    }

    query.take(dto.limit || 100);

    const pendingShipments = await query.getMany();

    if (pendingShipments.length === 0) {
      return {
        isSuccess: true,
        message: 'No pending delivered COD shipments awaiting reconciliation.',
        settledCount: 0,
        totalNetCredited: 0,
      };
    }

    const receipts: ReconcileCodReceiptItemDto[] = pendingShipments.map((s) => ({
      trackingNumber: s.trackingNumber,
      collectedAmount: s.codAmount,
      carrierCode: s.carrierName || dto.carrierCode || 'OTO',
      deliveryDate: s.deliveredAt ? s.deliveredAt.toISOString() : undefined,
      notes: 'Auto-reconciled from verified courier delivery confirmation',
    }));

    return this.processCourierReceiptsReconciliation(
      {
        carrierCode: dto.carrierCode || 'OTO',
        batchReference: `AUTO-REMIT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`,
        receipts,
        autoDeliverShipments: true,
        deductShippingFees: true,
        notes: `Automated COD pipeline scan for delivered shipments`,
      },
      actorId,
    );
  }

  /**
   * Get paginated reconciliation batches
   */
  async getReconciliationBatches(pagination: PaginationParamsDto) {
    const [items, total] = await this.reconciliationRepository.findAndCount({
      where: { isDeleted: false },
      order: { createdAt: 'DESC' },
      skip: (pagination.pageNumber - 1) * pagination.pageSize,
      take: pagination.pageSize,
    });

    return new PagedResult(
      items,
      total,
      pagination.pageNumber,
      pagination.pageSize,
    );
  }

  /**
   * Get single reconciliation batch by ID with detailed line items
   */
  async getReconciliationBatchById(id: string) {
    const batch = await this.reconciliationRepository.findOne({
      where: { id, isDeleted: false },
    });

    if (!batch) {
      throw new NotFoundException(`Reconciliation batch #${id} not found.`);
    }

    return batch;
  }
}
