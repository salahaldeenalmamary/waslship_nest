import {
  Controller,
  Get,
  Param,
  Post,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ShipmentsService } from '../services/shipments.service';
import { DeliveryFeeCheckDto } from '../dtos';

@ApiTags('Public Tracking & Carrier Pricing')
@Controller('api/tracking')
export class TrackingController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get(':trackingNumber')
  @ApiOperation({ summary: 'Public shipment tracking by tracking number' })
  async trackShipment(@Param('trackingNumber') trackingNumber: string) {
    return this.shipmentsService.trackShipment(trackingNumber);
  }

  @Post('delivery-fee')
  @ApiOperation({ summary: 'Calculate estimated delivery fee between cities' })
  async checkDeliveryFee(@Body() dto: DeliveryFeeCheckDto) {
    return this.shipmentsService.checkDeliveryFee(dto);
  }

  @Get('delivery-fee/order/:orderId')
  @ApiOperation({ summary: 'Get OTO carrier delivery fee for an order ID' })
  async getDeliveryFeeByOrderId(@Param('orderId') orderId: string) {
    return this.shipmentsService.getDeliveryFeeForOrder(orderId);
  }
}
