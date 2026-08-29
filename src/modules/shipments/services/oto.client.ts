import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class OtoClient {
  private readonly logger = new Logger(OtoClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('OTO_BASE_URL') ||
      'https://api.tryoto.com/rest/v2';
    this.apiKey = this.configService.get<string>('OTO_API_KEY') || '';
    this.webhookSecret =
      this.configService.get<string>('OTO_WEBHOOK_SECRET') || '';
  }

  async checkDeliveryFee(pickupCity: string, deliveryCity: string, weightKg: number) {
    if (!this.apiKey) {
      // Dynamic calculate rate if no external key
      const baseRate = pickupCity.toLowerCase() === deliveryCity.toLowerCase() ? 25.0 : 35.0;
      const extraWeightFee = Math.max(0, weightKg - 1) * 5.0;
      return {
        isSuccess: true,
        estimatedFee: baseRate + extraWeightFee,
        currency: 'SAR',
        carriers: [
          { name: 'Aramex', fee: baseRate + extraWeightFee, etaDays: 2 },
          { name: 'SMSA Express', fee: baseRate + extraWeightFee + 3, etaDays: 1 },
          { name: 'Wasl Standard Delivery', fee: baseRate + extraWeightFee - 2, etaDays: 2 },
        ],
      };
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/checkFee`,
        { pickupCity, deliveryCity, weight: weightKg },
        { headers: { Authorization: `Bearer ${this.apiKey}` } },
      );
      return response.data;
    } catch (err: any) {
      this.logger.warn(`OTO API check fee failed: ${err.message}. Using fallback engine.`);
      return {
        isSuccess: true,
        estimatedFee: 28.0,
        currency: 'SAR',
      };
    }
  }

  async createOtoOrder(shipment: any) {
    if (!this.apiKey) {
      // Return simulated OTO Order ID and tracking for sandbox
      const simulatedOtoId = 'OTO-' + Math.floor(100000 + Math.random() * 900000);
      return {
        success: true,
        otoOrderId: simulatedOtoId,
        carrierName: 'Wasl Express Logistics',
        trackingUrl: `https://tracking.waslship.com/${shipment.trackingNumber}`,
        deliveryFee: 28.0,
      };
    }

    try {
      const payload = {
        orderId: shipment.id,
        payment_method: shipment.paymentMethod === 'COD' ? 'cod' : 'paid',
        amount: shipment.codAmount,
        amount_due: shipment.paymentMethod === 'COD' ? shipment.codAmount : 0,
        senderName: shipment.senderName,
        senderPhone: shipment.senderPhone,
        senderCity: shipment.senderCity,
        senderAddress: shipment.senderAddress,
        recipientName: shipment.recipientName,
        recipientPhone: shipment.recipientPhone,
        recipientCity: shipment.recipientCity,
        recipientAddress: shipment.recipientAddress,
        packageWeight: shipment.weightKg,
        packageCount: shipment.piecesCount,
      };

      const res = await axios.post(`${this.baseUrl}/createOrder`, payload, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      return {
        success: true,
        otoOrderId: res.data.otoId || res.data.orderId,
        carrierName: res.data.deliveryCompany || 'Partner Carrier',
        trackingUrl: res.data.trackingUrl,
        deliveryFee: res.data.deliveryFee || 28.0,
      };
    } catch (err: any) {
      this.logger.error(`Failed to push order to OTO: ${err.message}`);
      return {
        success: false,
        otoOrderId: 'OTO-LOCAL-' + Math.floor(100000 + Math.random() * 900000),
        carrierName: 'Wasl Logistics Direct',
        deliveryFee: 28.0,
      };
    }
  }

  async cancelOtoOrder(otoOrderId: string) {
    if (!this.apiKey) return { success: true };
    try {
      await axios.post(
        `${this.baseUrl}/cancelOrder`,
        { otoId: otoOrderId },
        { headers: { Authorization: `Bearer ${this.apiKey}` } },
      );
      return { success: true };
    } catch (err: any) {
      this.logger.warn(`Failed OTO cancel: ${err.message}`);
      return { success: false };
    }
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) return true; // Accept if no secret is enforced in test mode
    try {
      const hash = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload)
        .digest('hex');
      return hash === signature;
    } catch {
      return false;
    }
  }
}
