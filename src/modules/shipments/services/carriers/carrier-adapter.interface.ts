export interface CarrierQuoteRequest {
  pickupCity: string;
  deliveryCity: string;
  weightKg?: number;
  piecesCount?: number;
  codAmount?: number;
  declaredValue?: number;
}

export interface CarrierQuoteResult {
  carrierCode: string; // e.g. 'SMSA', 'ARAMEX', 'DHL', 'SPL', 'OTO'
  carrierName: string; // e.g. 'SMSA Express', 'Aramex Domestic', 'DHL Express', 'SPL (Saudi Post)'
  serviceType: string; // e.g. 'Express', 'Economy', 'Standard'
  estimatedDays: string; // e.g. '1-2 business days'
  baseRate: number;
  codSurcharge: number;
  vatAmount: number;
  totalRate: number;
  currency: string;
  logoUrl?: string;
  isAvailable: boolean;
  notes?: string;
}

export interface DirectShipmentBookingRequest {
  shipmentId: string;
  trackingNumber?: string;
  senderName: string;
  senderPhone: string;
  senderCity: string;
  senderStreet: string;
  recipientName: string;
  recipientPhone: string;
  recipientCity: string;
  recipientStreet: string;
  weightKg: number;
  piecesCount: number;
  codAmount: number;
  packageDescription?: string;
}

export interface DirectShipmentBookingResult {
  success: boolean;
  carrierCode: string;
  carrierName: string;
  trackingNumber: string;
  trackingUrl: string;
  waybillPdfUrl?: string;
  cost: number;
  currency: string;
  rawResponse?: any;
  errorMessage?: string;
}

export interface ICarrierAdapter {
  readonly carrierCode: string;
  readonly carrierName: string;
  calculateRate(request: CarrierQuoteRequest): Promise<CarrierQuoteResult>;
  bookShipment(request: DirectShipmentBookingRequest): Promise<DirectShipmentBookingResult>;
  trackShipment(trackingNumber: string): Promise<any>;
}
