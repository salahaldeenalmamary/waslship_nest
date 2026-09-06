import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';

export interface OtoGetDeliveryFeeRequest {
  orderId: string;
}

export interface OtoDeliveryOption {
  serviceType: string;
  deliveryOptionName: string;
  trackingType?: string;
  codCharge?: number;
  pickupCutOffTime?: string;
  maxOrderValue?: number;
  maxCODValue?: number;
  deliveryOptionId?: number | string;
  extraWeightPerKg?: number;
  deliveryCompanyName: string;
  returnFee?: number;
  maxFreeWeight?: number;
  avgDeliveryTime?: string;
  price: number;
  logo?: string;
  currency?: string;
  pickupDropoff?: string;
  cardOnDeliveryPercentage?: string;
}

export interface OtoGetDeliveryFeeResponse {
  success: boolean;
  deliveryCompany?: OtoDeliveryOption[];
  deliveryFee?: number;
  currency?: string;
  orderId?: string;
  carrierName?: string;
  [key: string]: any;
}

export interface OtoCreateShipmentRequest {
  orderId: string | number;
  deliveryOptionId?: string | number;
}

export interface OtoCreateShipmentResponse {
  success: boolean;
  otoId?: string;
  orderId?: string;
  deliveryOptionId?: string;
  deliveryCompanyName?: string;
  deliveryCompany?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  airwayBillUrl?: string;
  status?: string;
  deliveryFee?: number;
  [key: string]: any;
}

@Injectable()
export class OtoClient {
  private readonly logger = new Logger(OtoClient.name);
  private cachedToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.webhookSecret =
      this.configService.get<string>('OTO_WEBHOOK_SECRET') || '';
  }

  /**
   * Normalizes the full OTO REST API URL and prevents path mismatches (such as double slashes)
   */
  getFullUrl(endpoint: string): string {
    const rawBase =
      this.configService.get<string>('OTO_BASE_URL') ||
      process.env.OTO_BASE_URL ||
      'https://api.tryoto.com/rest/v2';

    let base = rawBase.trim().replace(/\/+$/, '');

    // Ensure /rest/v2 is part of the base path
    if (!base.endsWith('/rest/v2') && !base.includes('/rest/v2')) {
      base = `${base}/rest/v2`;
    }

    const cleanPath = endpoint
      .trim()
      .replace(/^https?:\/\/[^/]+/, '')
      .replace(/^\/?rest\/v2\/?/, '')
      .replace(/^\/+/, '');

    return `${base}/${cleanPath}`;
  }

  /**
   * Exchanges an OTO Refresh Token for a short-lived Access Token via POST /rest/v2/refreshToken
   */
  async refreshAccessToken(force = false): Promise<string> {
    if (!force && this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    const refreshToken =
      this.configService.get<string>('OTO_REFRESH_TOKEN') ||
      process.env.OTO_REFRESH_TOKEN ||
      this.configService.get<string>('OTO_ACCESS_TOKEN') ||
      process.env.OTO_ACCESS_TOKEN ||
      this.configService.get<string>('OTO_API_KEY') ||
      process.env.OTO_API_KEY;

    if (!refreshToken || !refreshToken.trim()) {
      throw new BadRequestException(
        'OTO Credentials Missing: Please configure OTO_REFRESH_TOKEN in your environment or settings so the system can generate access tokens for the OTO API.',
      );
    }

    const cleanRefreshToken = refreshToken.trim().replace(/^Bearer\s+/i, '');
    const url = this.getFullUrl('refreshToken');

    this.logger.log(`Requesting new OTO access token using refresh token via ${url}`);

    try {
      const response = await axios.post(
        url,
        {
          refresh_token: cleanRefreshToken,
          refreshToken: cleanRefreshToken,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 12000,
        },
      );

      const data = response.data;
      const accessToken =
        data?.access_token ||
        data?.accessToken ||
        data?.token ||
        data?.data?.access_token ||
        data?.data?.token;

      if (!accessToken) {
        throw new Error(
          `OTO refreshToken endpoint did not return an access_token: ${JSON.stringify(data)}`,
        );
      }

      // TTL in milliseconds (default to 50 minutes if expires_in is not provided)
      const expiresInSec = Number(data?.expires_in || data?.expiresIn || 3600);
      const safeTtlMs = Math.max(300, expiresInSec - 300) * 1000;

      this.cachedToken = accessToken.trim().replace(/^Bearer\s+/i, '');
      this.tokenExpiresAt = Date.now() + safeTtlMs;

      this.logger.log(
        `Successfully acquired OTO access token. Valid for ${Math.round(safeTtlMs / 1000)} seconds.`,
      );

      return this.cachedToken;
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message;
      this.logger.error(`Failed to obtain access token from OTO refreshToken: ${errorMsg}`);

      // Fallback: if refreshToken call failed, check if the token provided was already a direct static access token
      const staticToken =
        this.configService.get<string>('OTO_ACCESS_TOKEN') ||
        process.env.OTO_ACCESS_TOKEN;
      if (staticToken && staticToken.trim()) {
        this.logger.warn('Falling back to static OTO_ACCESS_TOKEN');
        return staticToken.trim().replace(/^Bearer\s+/i, '');
      }

      throw new BadRequestException(
        `OTO Authentication Failed: Unable to get access token from refresh token. ${errorMsg ? `Details: ${errorMsg}` : ''}`,
      );
    }
  }

  /**
   * Retrieves a valid OTO Access Token, always using the refresh token flow
   */
  async getValidAccessToken(forceRefresh = false): Promise<string> {
    return this.refreshAccessToken(forceRefresh);
  }

  /**
   * Helper to send POST requests directly to OTO API with access token and auto-retry on 401
   */
  async sendPostAsync<T = any>(
    endpoint: string,
    payload: any,
    isRetry = false,
  ): Promise<T> {
    const url = this.getFullUrl(endpoint);
    const token = await this.getValidAccessToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    this.logger.debug(`Calling OTO API POST: ${url}`);
    try {
      const response = await axios.post<T>(url, payload, { headers, timeout: 15000 });
      return response.data;
    } catch (err: any) {
      if (err.response?.status === 401 && !isRetry) {
        this.logger.warn('OTO API returned 401 Unauthorized. Refreshing access token and retrying...');
        await this.getValidAccessToken(true);
        return this.sendPostAsync<T>(endpoint, payload, true);
      }
      throw err;
    }
  }

  /**
   * Alias for C# / .NET naming compatibility
   */
  async SendPostAsync<T = any>(endpoint: string, payload: any): Promise<T> {
    return this.sendPostAsync<T>(endpoint, payload);
  }

  /**
   * Helper to send GET requests directly to OTO API with access token and auto-retry on 401
   */
  async sendGetAsync<T = any>(
    endpoint: string,
    params?: any,
    isRetry = false,
  ): Promise<T> {
    const url = this.getFullUrl(endpoint);
    const token = await this.getValidAccessToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    this.logger.debug(`Calling OTO API GET: ${url}`);
    try {
      const response = await axios.get<T>(url, { headers, params, timeout: 15000 });
      return response.data;
    } catch (err: any) {
      if (err.response?.status === 401 && !isRetry) {
        this.logger.warn('OTO API returned 401 Unauthorized. Refreshing access token and retrying...');
        await this.getValidAccessToken(true);
        return this.sendGetAsync<T>(endpoint, params, true);
      }
      throw err;
    }
  }

  /**
   * Normalizes carrier list from different OTO response structures
   */
  private extractCarriersFromResponse(response: any): Array<{
    carrierCode: string;
    carrierName: string;
    description: string;
    logoUrl?: string;
    price?: number;
    currency?: string;
  }> {
    const list =
      response?.deliveryCompany ||
      response?.deliveryCompanies ||
      response?.deliveryOptions ||
      response?.options ||
      response?.data ||
      response?.carriers ||
      (Array.isArray(response) ? response : []);

    if (Array.isArray(list) && list.length > 0) {
      return list.map((c: any) => ({
        carrierCode: (
          c.deliveryOptionId ||
          c.code ||
          c.id ||
          c.carrierCode ||
          'OTO'
        ).toString(),
        carrierName:
          c.deliveryCompanyName ||
          c.companyName ||
          c.name ||
          c.carrierName ||
          'OTO Delivery',
        description:
          c.deliveryOptionName ||
          c.serviceType ||
          c.description ||
          'OTO Shipping Option',
        logoUrl: c.logo || c.logoUrl,
        price: Number(c.price || c.deliveryFee || c.fee || 0),
        currency: c.currency || 'SAR',
      }));
    }
    return [];
  }

  /**
   * Fetch active delivery companies / carriers strictly directly from OTO REST API.
   * Tests checkOTODeliveryFee, checkDeliveryFee, and getDeliveryOptions in sequence.
   */
  async getDeliveryCompaniesFromOtoApi(
    pickupCity = 'Riyadh',
    deliveryCity = 'Jeddah',
    weightKg = 1.0,
    codAmount = 0,
  ): Promise<
    Array<{
      carrierCode: string;
      carrierName: string;
      description: string;
      logoUrl?: string;
      price?: number;
      currency?: string;
    }>
  > {
    const token = await this.getValidAccessToken();

    if (!token) {
      throw new BadRequestException(
        'OTO API credentials missing: Please set OTO_ACCESS_TOKEN or OTO_REFRESH_TOKEN in your environment to fetch live carriers from OTO API.',
      );
    }

    const requestPayload = {
      originCity: pickupCity,
      destinationCity: deliveryCity,
      weight: weightKg,
      originCountry: 'SA',
      destinationCountry: 'SA',
      packageCount: 1,
      totalDue: codAmount,
    };

    let lastError = '';

    // Attempt 1: POST /rest/v2/checkOTODeliveryFee (OTO Rates)
    try {
      const response = await this.sendPostAsync<any>(
        'checkOTODeliveryFee',
        requestPayload,
      );
      const carriers = this.extractCarriersFromResponse(response);
      if (carriers.length > 0) return carriers;
    } catch (err: any) {
      lastError = err.response?.data?.message || err.message;
      this.logger.warn(`OTO checkOTODeliveryFee call failed: ${lastError}`);
    }

    // Attempt 2: POST /rest/v2/checkDeliveryFee (Merchant Custom Rates)
    try {
      const response = await this.sendPostAsync<any>(
        'checkDeliveryFee',
        requestPayload,
      );
      const carriers = this.extractCarriersFromResponse(response);
      if (carriers.length > 0) return carriers;
    } catch (err: any) {
      lastError = err.response?.data?.message || err.message;
      this.logger.warn(`OTO checkDeliveryFee call failed: ${lastError}`);
    }

    // Attempt 3: GET /rest/v2/getDeliveryOptions (Registered Delivery Options)
    try {
      const response = await this.sendGetAsync<any>('getDeliveryOptions', {
        city: pickupCity,
      });
      const carriers = this.extractCarriersFromResponse(response);
      if (carriers.length > 0) return carriers;
    } catch (err: any) {
      lastError = err.response?.data?.message || err.message;
      this.logger.warn(`OTO getDeliveryOptions GET call failed: ${lastError}`);
    }

    // Attempt 4: POST /rest/v2/getDeliveryOptions
    try {
      const response = await this.sendPostAsync<any>('getDeliveryOptions', {
        city: pickupCity,
      });
      const carriers = this.extractCarriersFromResponse(response);
      if (carriers.length > 0) return carriers;
    } catch (err: any) {
      lastError = err.response?.data?.message || err.message;
      this.logger.warn(`OTO getDeliveryOptions POST call failed: ${lastError}`);
    }

    throw new BadRequestException(
      `OTO API Error: Unable to retrieve carriers directly from OTO API. Details: ${lastError || 'No active carrier options returned by OTO.'}`,
    );
  }

  /**
   * Create shipment with selected delivery option via OTO Gateway
   * Endpoint: rest/v2/createShipment
   */
  async createShipment(request: {
    orderId: string | number;
    deliveryOptionId?: string | number | null;
  }): Promise<OtoCreateShipmentResponse> {
    const payload = {
      orderId: request.orderId,
      deliveryOptionId: request.deliveryOptionId?.toString(),
    };

    return this.sendPostAsync<OtoCreateShipmentResponse>(
      'createShipment',
      payload,
    );
  }

  async createShipmentAsync(request: {
    orderId: string | number;
    deliveryOptionId?: string | number | null;
  }): Promise<OtoCreateShipmentResponse> {
    return this.createShipment(request);
  }

  /**
   * Query delivery fee and available delivery options for an existing order from OTO (Step 2)
   */
  async getDeliveryFeeAsync(
    orderId: string,
  ): Promise<OtoGetDeliveryFeeResponse> {
    const payload: OtoGetDeliveryFeeRequest = { orderId };
    return this.sendPostAsync<OtoGetDeliveryFeeResponse>(
      'getDeliveryFee',
      payload,
    );
  }

  async getDeliveryFee(orderId: string): Promise<OtoGetDeliveryFeeResponse> {
    return this.getDeliveryFeeAsync(orderId);
  }

  /**
   * Estimate shipping rates strictly directly from OTO pricing API
   */
  async estimateRate(dto: {
    pickupCity: string;
    deliveryCity: string;
    weightKg?: number;
    piecesCount?: number;
    codAmount?: number;
    carrierCode?: string;
  }) {
    const token = await this.getValidAccessToken();

    if (!token) {
      throw new BadRequestException(
        'OTO API credentials missing: Please set OTO_ACCESS_TOKEN or OTO_REFRESH_TOKEN in your environment to query OTO API.',
      );
    }

    const originCity = dto.pickupCity || 'Riyadh';
    const destinationCity = dto.deliveryCity || 'Jeddah';
    const weight = dto.weightKg || 1.0;
    const codAmount = dto.codAmount || 0;

    const payload = {
      originCity,
      destinationCity,
      weight,
      originCountry: 'SA',
      destinationCountry: 'SA',
      packageCount: dto.piecesCount || 1,
      totalDue: codAmount,
    };

    let optionsList: any[] = [];
    let lastError = '';

    // Attempt 1: OTO API /rest/v2/checkOTODeliveryFee
    try {
      const rawResponse = await this.sendPostAsync(
        'checkOTODeliveryFee',
        payload,
      );
      const list =
        rawResponse?.deliveryCompany ||
        rawResponse?.deliveryCompanies ||
        rawResponse?.deliveryOptions ||
        rawResponse?.options ||
        rawResponse?.data ||
        rawResponse?.carriers;
      if (Array.isArray(list) && list.length > 0) {
        optionsList = list;
      }
    } catch (err: any) {
      lastError = err.response?.data?.message || err.message;
      this.logger.warn(`OTO checkOTODeliveryFee call failed: ${lastError}`);
    }

    // Attempt 2: OTO API /rest/v2/checkDeliveryFee
    if (optionsList.length === 0) {
      try {
        const rawResponse = await this.sendPostAsync(
          'checkDeliveryFee',
          payload,
        );
        const list =
          rawResponse?.deliveryCompany ||
          rawResponse?.deliveryCompanies ||
          rawResponse?.deliveryOptions ||
          rawResponse?.options ||
          rawResponse?.data ||
          rawResponse?.carriers;
        if (Array.isArray(list) && list.length > 0) {
          optionsList = list;
        }
      } catch (err: any) {
        lastError = err.response?.data?.message || err.message;
        this.logger.warn(`OTO checkDeliveryFee call failed: ${lastError}`);
      }
    }

    // Attempt 3: OTO API /rest/v2/getDeliveryOptions
    if (optionsList.length === 0) {
      try {
        const rawResponse = await this.sendGetAsync('getDeliveryOptions', {
          city: originCity,
        });
        const list =
          rawResponse?.deliveryCompany ||
          rawResponse?.deliveryCompanies ||
          rawResponse?.deliveryOptions ||
          rawResponse?.options ||
          rawResponse?.data ||
          rawResponse?.carriers;
        if (Array.isArray(list) && list.length > 0) {
          optionsList = list;
        }
      } catch (err: any) {
        lastError = err.response?.data?.message || err.message;
        this.logger.warn(`OTO getDeliveryOptions call failed: ${lastError}`);
      }
    }

    if (optionsList.length === 0) {
      throw new BadRequestException(
        `OTO API Error: Failed to fetch shipping rates directly from OTO API. Details: ${lastError || 'No delivery options returned by OTO.'}`,
      );
    }

    const mappedQuotes = optionsList.map((item: any) => ({
      deliveryOptionId: (
        item.deliveryOptionId ||
        item.code ||
        item.id ||
        'OTO'
      ).toString(),
      carrierName:
        item.deliveryCompanyName ||
        item.name ||
        item.companyName ||
        'OTO Carrier',
      optionName:
        item.deliveryOptionName ||
        item.serviceType ||
        'OTO Shipping Option',
      price: Number(item.price || item.deliveryFee || item.fee || 0),
      currency: item.currency || 'SAR',
      avgDeliveryTime: item.avgDeliveryTime || 'N/A',
      logoUrl: item.logo || item.logoUrl,
    }));

    const lowestRate = Math.min(...mappedQuotes.map((q) => q.price));

    return {
      success: true,
      source: 'OTO REST API v2',
      pickupCity: originCity,
      deliveryCity: destinationCity,
      weightKg: weight,
      piecesCount: dto.piecesCount || 1,
      codAmount,
      quotesCount: mappedQuotes.length,
      lowestRate,
      quotes: mappedQuotes,
    };
  }

  /**
   * Estimate shipping rates directly from OTO API via checkOTODeliveryFee / checkDeliveryFee
   */
  async checkDeliveryFee(
    pickupCity: string,
    deliveryCity: string,
    weightKg: number,
    codAmount = 0,
  ) {
    const payload = {
      originCity: pickupCity,
      destinationCity: deliveryCity,
      weight: weightKg,
      originCountry: 'SA',
      destinationCountry: 'SA',
      packageCount: 1,
      totalDue: codAmount,
    };

    try {
      return await this.sendPostAsync('checkOTODeliveryFee', payload);
    } catch (err1: any) {
      try {
        return await this.sendPostAsync('checkDeliveryFee', payload);
      } catch (err2: any) {
        const errorMsg =
          err2.response?.data?.message ||
          err1.response?.data?.message ||
          err2.message ||
          err1.message;
        throw new BadRequestException(
          `OTO API Error (checkDeliveryFee): ${errorMsg}`,
        );
      }
    }
  }

  /**
   * Step 1: Create Order in OTO without pre-selected deliveryOptionId
   */
  async createOtoOrder(shipment: any) {
    const payload = {
      orderId: shipment.id || `WSL-${Date.now()}`,
      pickupAddress: {
        title: shipment.pickupAddress?.title || 'Main Warehouse',
        name: shipment.pickupAddress?.contactName || 'Warehouse Manager',
        phone: shipment.pickupAddress?.contactPhone || '+966500000000',
        city: shipment.pickupAddress?.city || 'Riyadh',
        street: shipment.pickupAddress?.street || 'Warehouse St',
      },
      deliveryAddress: {
        title: shipment.deliveryAddress?.title || 'Customer',
        name: shipment.deliveryAddress?.contactName || 'Customer',
        phone: shipment.deliveryAddress?.contactPhone || '+966500000000',
        city: shipment.deliveryAddress?.city || 'Jeddah',
        street: shipment.deliveryAddress?.street || 'Main St',
      },
      paymentMethod: shipment.paymentMethod || 'COD',
      codAmount: shipment.codAmount || 0,
      weight: shipment.weightKg || 1,
    };

    const response = await this.sendPostAsync('createOrder', payload);
    return {
      success: true,
      otoOrderId: response.otoId || response.orderId || payload.orderId,
      orderId: shipment.id || payload.orderId,
      carrierName: response.deliveryCompany || 'OTO Gateway',
      trackingUrl: response.trackingUrl,
      deliveryFee: response.deliveryFee || 0.0,
    };
  }

  async trackOrder(otoOrderId: string) {
    return this.sendPostAsync('trackOrder', {
      orderId: otoOrderId,
    });
  }

  async printLabel(orderId: string) {
    const response = await this.sendPostAsync('printLabel', {
      orderId,
    });
    return {
      success: true,
      pdfUrl: response.pdf || response.labelUrl,
      labelUrl: response.pdf || response.labelUrl,
    };
  }

  async cancelOtoOrder(orderId: string) {
    return this.sendPostAsync('cancelOrder', {
      orderId,
    });
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) return true;
    try {
      const hmac = crypto.createHmac('sha256', this.webhookSecret);
      const computed = hmac.update(payload).digest('hex');
      return computed === signature;
    } catch {
      return false;
    }
  }
}
