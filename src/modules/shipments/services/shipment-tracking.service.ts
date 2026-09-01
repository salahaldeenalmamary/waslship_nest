import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shipment } from '../entities/shipment.entity';

@Injectable()
export class ShipmentTrackingService {
  constructor(
    @InjectRepository(Shipment)
    private readonly shipmentRepository: Repository<Shipment>,
  ) {}

  /**
   * Track shipment publicly or internally using tracking number
   */
  async trackShipment(trackingNumber: string) {
    const shipment = await this.shipmentRepository.findOne({
      where: { trackingNumber, isDeleted: false },
      relations: ['pickupAddress', 'deliveryAddress'],
    });
    if (!shipment) {
      throw new NotFoundException(`Tracking #${trackingNumber} not found`);
    }

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
}
