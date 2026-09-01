import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shipment } from '../entities/shipment.entity';
import { ShipmentStatus } from '../enums/shipment.enum';
import { OtoClient } from './oto.client';
import { ShipmentAuditService, AuditActor } from './shipment-audit.service';

@Injectable()
export class ShipmentCarrierService {
  private readonly logger = new Logger(ShipmentCarrierService.name);

  constructor(
    @InjectRepository(Shipment)
    private readonly shipmentRepository: Repository<Shipment>,
    private readonly otoClient: OtoClient,
    private readonly auditService: ShipmentAuditService,
  ) {}

  /**
   * Helper to retrieve shipment details or fail with NotFoundException
   */
  private async findShipmentById(shipmentId: string, merchantId?: string): Promise<Shipment> {
    const query: any = { id: shipmentId, isDeleted: false };
    if (merchantId) query.merchantId = merchantId;

    const shipment = await this.shipmentRepository.findOne({
      where: query,
      relations: ['pickupAddress', 'deliveryAddress'],
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    return shipment;
  }

  /**
   * Estimate delivery fee between two cities
   */
  async checkDeliveryFee(
    pickupCity: string,
    deliveryCity: string,
    weightKg: number = 1,
  ) {
    return this.otoClient.checkDeliveryFee(pickupCity, deliveryCity, weightKg);
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
    const shipment = await this.findShipmentById(shipmentId, merchantId);
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
    const shipment = await this.findShipmentById(shipmentId);
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
    const shipment = await this.findShipmentById(shipmentId, merchantId);
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
    const shipment = await this.findShipmentById(shipmentId, merchantId);
    const effectiveOrderId = shipment.otoOrderId || shipment.id;
    const labelResult = await this.otoClient.printLabel(effectiveOrderId);
    return {
      shipmentId: shipment.id,
      trackingNumber: shipment.trackingNumber,
      carrierName: shipment.carrierName,
      status: shipment.status,
      senderCity: shipment.pickupAddress?.city,
      recipientCity: shipment.deliveryAddress?.city,
      labelUrl:
        labelResult.labelUrl ||
        `https://api.waslship.com/labels/${shipment.trackingNumber}.pdf`,
      ...labelResult,
    };
  }

  /**
   * Admin: Force re-sync shipment with OTO Gateway
   */
  async syncOtoOrderAdmin(shipmentId: string) {
    const shipment = await this.findShipmentById(shipmentId);
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
}
