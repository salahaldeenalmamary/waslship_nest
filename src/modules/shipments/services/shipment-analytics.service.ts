import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shipment } from '../entities/shipment.entity';
import { ShipmentStatus } from '../enums/shipment.enum';

@Injectable()
export class ShipmentAnalyticsService {
  constructor(
    @InjectRepository(Shipment)
    private readonly shipmentRepository: Repository<Shipment>,
  ) {}

  /**
   * Platform or Merchant Dashboard Overview
   */
  async getDashboardOverview(merchantId?: string) {
    const query = this.shipmentRepository
      .createQueryBuilder('s')
      .where('s.isDeleted = false');

    if (merchantId) {
      query.andWhere('s.merchantId = :merchantId', { merchantId });
    }

    const totalShipments = await query.getCount();
    const deliveredCount = await query
      .clone()
      .andWhere('s.status = :st', { st: ShipmentStatus.Delivered })
      .getCount();
    const inTransitCount = await query
      .clone()
      .andWhere('s.status IN (:...sts)', {
        sts: [
          ShipmentStatus.InTransit,
          ShipmentStatus.PickedUp,
          ShipmentStatus.OutForDelivery,
        ],
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

  /**
   * Comprehensive Admin Shipment Analytics
   */
  async getShipmentAnalyticsAdmin() {
    const query = this.shipmentRepository
      .createQueryBuilder('s')
      .where('s.isDeleted = false');

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
        totalOtoDeliveryFee: parseFloat(
          financialTotals?.totalOtoDeliveryFee || '0',
        ),
        currency: 'SAR',
      },
    };
  }
}
