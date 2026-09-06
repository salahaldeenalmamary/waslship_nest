import { Injectable, Logger } from '@nestjs/common';
import {
  ICarrierAdapter,
  CarrierQuoteRequest,
  CarrierQuoteResult,
  DirectShipmentBookingRequest,
  DirectShipmentBookingResult,
} from './carrier-adapter.interface';
import { OtoCarrierAdapter } from './oto.adapter';
import { OtoClient } from '../oto.client';

@Injectable()
export class MultiCarrierRegistryService {
  private readonly logger = new Logger(MultiCarrierRegistryService.name);

  constructor(
    private readonly otoAdapter: OtoCarrierAdapter,
    private readonly otoClient: OtoClient,
  ) {}

  /**
   * List active carriers fetched directly from OTO API
   */
  async getAvailableCarriers() {
    return this.otoClient.getDeliveryCompaniesFromOtoApi();
  }

  /**
   * Retrieve carrier adapter (OTO Gateway)
   */
  getAdapter(_carrierCode?: string): ICarrierAdapter {
    return this.otoAdapter;
  }

  /**
   * Get shipping rate estimates strictly through OTO Gateway
   */
  async estimateShippingRates(
    request: CarrierQuoteRequest,
    _requestedCarrierCode?: string,
  ): Promise<{
    gateway: string;
    pickupCity: string;
    deliveryCity: string;
    weightKg: number;
    piecesCount: number;
    codAmount: number;
    quotesCount: number;
    lowestRate: number;
    quotes: CarrierQuoteResult[];
  }> {
    const pickupCity = request.pickupCity || 'Riyadh';
    const deliveryCity = request.deliveryCity || 'Jeddah';
    const weightKg = request.weightKg || 1;
    const piecesCount = request.piecesCount || 1;
    const codAmount = request.codAmount || 0;

    const otoQuote = await this.otoAdapter.calculateRate(request);
    const quotes = [otoQuote];

    return {
      gateway: 'OTO Gateway',
      pickupCity,
      deliveryCity,
      weightKg,
      piecesCount,
      codAmount,
      quotesCount: 1,
      lowestRate: otoQuote.totalRate,
      quotes,
    };
  }

  /**
   * Book shipment strictly through OTO Carrier Gateway
   */
  async bookDirectShipment(
    carrierCode: string,
    bookingReq: DirectShipmentBookingRequest,
  ): Promise<DirectShipmentBookingResult> {
    this.logger.log(`Booking via OTO Gateway for code '${carrierCode}'`);
    return this.otoAdapter.bookShipment(bookingReq);
  }

  /**
   * Track shipment strictly through OTO Carrier Gateway
   */
  async trackDirectShipment(_carrierCode: string, trackingNumber: string) {
    return this.otoAdapter.trackShipment(trackingNumber);
  }
}
