import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ShipmentsService } from '../services/shipments.service';
import { CurrentUser } from '../../auth/current-user.decorator';
import {
  CreateOtoShipmentDto,
  SelectDeliveryOptionDto,
  PrepareOtoPayloadDto,
} from '../dtos';

@ApiTags('Shipments (Carrier & OTO Gateway)')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('api/shipments')
export class ShipmentCarrierController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post('oto/prepare-payload')
  @ApiOperation({
    summary:
      'Helper: Fetch and validate UserAddress details based on pickupAddressId and deliveryAddressId to prepare OTO createShipment payload',
  })
  async prepareOtoPayload(@Body() dto: PrepareOtoPayloadDto) {
    return this.shipmentsService.prepareOtoCreateShipmentPayload(
      dto.pickupAddressId,
      dto.deliveryAddressId,
      dto,
    );
  }

  @Get('oto/delivery-fee/:orderId')
  @ApiOperation({
    summary:
      'Step 2: Get available delivery companies & deliveryOptionId options for an order from OTO',
  })
  async getOtoDeliveryFee(@Param('orderId') orderId: string) {
    return this.shipmentsService.getDeliveryFeeForOrder(orderId);
  }

  @Post('oto/create-shipment')
  @ApiOperation({
    summary:
      'Step 3: Complete shipment on OTO with orderId and selected deliveryOptionId',
  })
  async createOtoShipment(@Body() dto: CreateOtoShipmentDto) {
    return this.shipmentsService.createOtoShipment(
      dto.orderId,
      dto.deliveryOptionId,
    );
  }

  @Get(':id/delivery-options')
  @ApiOperation({
    summary:
      'Step 2 (By Shipment ID): Query available delivery companies & fee options for a specific shipment',
  })
  async getDeliveryOptionsForShipment(
    @CurrentUser('id') merchantId: string,
    @Param('id') shipmentId: string,
  ) {
    return this.shipmentsService.getDeliveryOptionsForShipment(
      shipmentId,
      merchantId,
    );
  }

  @Post(':id/select-delivery-option')
  @ApiOperation({
    summary:
      'Step 3 (By Shipment ID): Select deliveryOptionId and finalize booking with OTO carrier',
  })
  async selectDeliveryOption(
    @CurrentUser('id') merchantId: string,
    @Param('id') shipmentId: string,
    @Body() dto: SelectDeliveryOptionDto,
  ) {
    return this.shipmentsService.selectDeliveryOptionForShipment(
      shipmentId,
      merchantId,
      dto.deliveryOptionId,
    );
  }

  @Get(':id/label')
  @ApiOperation({
    summary: 'Get printable shipping label / Air Waybill (AWB) URL',
  })
  async getShipmentLabel(
    @CurrentUser('id') merchantId: string,
    @Param('id') shipmentId: string,
  ) {
    return this.shipmentsService.getShipmentLabel(shipmentId, merchantId);
  }
}
