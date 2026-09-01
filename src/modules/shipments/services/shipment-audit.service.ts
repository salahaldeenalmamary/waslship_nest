import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShipmentAuditLog } from '../entities/shipment-audit-log.entity';
import { Shipment } from '../entities/shipment.entity';
import { ShipmentStatus } from '../enums/shipment.enum';
import { PaginationParamsDto, PagedResult } from '../../../common/dtos/pagination.dto';

export interface AuditActor {
  id?: string;
  email?: string;
  fullName?: string;
  role?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateAuditEntryParams {
  shipmentId: string;
  trackingNumber?: string;
  action: string;
  fromStatus?: ShipmentStatus | null;
  toStatus?: ShipmentStatus | null;
  actor?: AuditActor | null;
  source?: string;
  notes?: string | null;
  metadata?: Record<string, any> | null;
}

@Injectable()
export class ShipmentAuditService {
  private readonly logger = new Logger(ShipmentAuditService.name);

  constructor(
    @InjectRepository(ShipmentAuditLog)
    private readonly auditRepository: Repository<ShipmentAuditLog>,
  ) {}

  /**
   * Primary entrypoint to persist an administrative audit log entry
   */
  async recordAudit(params: CreateAuditEntryParams): Promise<ShipmentAuditLog> {
    try {
      const entry = this.auditRepository.create({
        shipmentId: params.shipmentId,
        trackingNumber: params.trackingNumber,
        action: params.action,
        fromStatus: params.fromStatus || null,
        toStatus: params.toStatus || null,
        adminId: params.actor?.id || null,
        adminName: params.actor?.fullName || null,
        adminEmail: params.actor?.email || null,
        adminRole: params.actor?.role || null,
        ipAddress: params.actor?.ipAddress || null,
        userAgent: params.actor?.userAgent || null,
        source: params.source || (params.actor?.role ? 'ADMIN_PORTAL' : 'SYSTEM'),
        notes: params.notes || null,
        metadata: params.metadata || null,
      });

      const saved = await this.auditRepository.save(entry);
      this.logger.log(
        `[AUDIT] Action: ${params.action} on Shipment ${params.shipmentId} (${params.trackingNumber || 'N/A'}) by Admin: ${params.actor?.email || 'SYSTEM'}. Transition: ${params.fromStatus || 'None'} -> ${params.toStatus || 'None'}`,
      );
      return saved;
    } catch (err: any) {
      this.logger.error(`Failed to write shipment audit log: ${err.message}`, err.stack);
      // Return unpersisted entity fallback to never block business flow
      return this.auditRepository.create({
        shipmentId: params.shipmentId,
        action: params.action,
      });
    }
  }

  /**
   * Record shipment initiation by Admin
   */
  async recordShipmentInitiationByAdmin(
    shipment: Shipment,
    admin: AuditActor,
    metadata?: Record<string, any>,
  ): Promise<ShipmentAuditLog> {
    return this.recordAudit({
      shipmentId: shipment.id,
      trackingNumber: shipment.trackingNumber,
      action: 'ADMIN_INITIATED_SHIPMENT',
      fromStatus: null,
      toStatus: shipment.status,
      actor: admin,
      source: 'ADMIN_PORTAL',
      notes: `Shipment created by Admin ${admin.fullName || admin.email} on behalf of merchant ${shipment.merchantId}`,
      metadata: {
        merchantId: shipment.merchantId,
        pickupAddressId: shipment.pickupAddressId,
        deliveryAddressId: shipment.deliveryAddressId,
        shippingCost: shipment.shippingCost,
        paymentMethod: shipment.paymentMethod,
        codAmount: shipment.codAmount,
        ...metadata,
      },
    });
  }

  /**
   * Record every state transition with timestamp and actor
   */
  async recordStateTransition(
    shipmentId: string,
    trackingNumber: string,
    fromStatus: ShipmentStatus,
    toStatus: ShipmentStatus,
    actor?: AuditActor | null,
    source: string = 'ADMIN_PORTAL',
    notes?: string,
    metadata?: Record<string, any>,
  ): Promise<ShipmentAuditLog> {
    return this.recordAudit({
      shipmentId,
      trackingNumber,
      action: `STATE_TRANSITION_${fromStatus}_TO_${toStatus}`,
      fromStatus,
      toStatus,
      actor,
      source,
      notes: notes || `State transitioned from ${fromStatus} to ${toStatus}`,
      metadata,
    });
  }

  /**
   * Fetch all audit logs for a specific shipment ordered chronologically
   */
  async getAuditLogsForShipment(
    shipmentId: string,
    pagination: PaginationParamsDto = new PaginationParamsDto(),
  ): Promise<PagedResult<ShipmentAuditLog>> {
    const pageNumber = pagination.pageNumber || 1;
    const pageSize = pagination.pageSize || 50;
    const skip = (pageNumber - 1) * pageSize;

    const [items, total] = await this.auditRepository.findAndCount({
      where: { shipmentId },
      order: { createdAt: 'DESC' },
      skip,
      take: pageSize,
    });

    return new PagedResult<ShipmentAuditLog>(items, total, pageNumber, pageSize);
  }

  /**
   * Fetch platform-wide administrative audit logs with filtering
   */
  async getAllAuditLogs(
    pagination: PaginationParamsDto = new PaginationParamsDto(),
    action?: string,
    adminId?: string,
    shipmentId?: string,
  ): Promise<PagedResult<ShipmentAuditLog>> {
    const pageNumber = pagination.pageNumber || 1;
    const pageSize = pagination.pageSize || 20;
    const skip = (pageNumber - 1) * pageSize;

    const query = this.auditRepository.createQueryBuilder('log');

    if (action) {
      query.andWhere('log.action ILIKE :action', { action: `%${action}%` });
    }
    if (adminId) {
      query.andWhere('log.adminId = :adminId', { adminId });
    }
    if (shipmentId) {
      query.andWhere('log.shipmentId = :shipmentId', { shipmentId });
    }

    query.orderBy('log.createdAt', 'DESC');
    query.skip(skip).take(pageSize);

    const [items, total] = await query.getManyAndCount();

    return new PagedResult<ShipmentAuditLog>(items, total, pageNumber, pageSize);
  }
}
