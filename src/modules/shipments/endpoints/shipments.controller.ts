import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ShipmentsService } from '../services/shipments.service';
import { CurrentUser } from '../../auth/current-user.decorator';
import { ShipmentStatus } from '../enums/shipment.enum';
import {
  CreateShipmentDto,
  BulkCreateOrderDto,
  UpdateShipmentStatusDto,
  CreateOtoShipmentDto,
  SelectDeliveryOptionDto,
  PrepareOtoPayloadDto,
} from '../dtos/shipment.dto';
import { PaginationParamsDto } from '../../../common/dtos/pagination.dto';

@ApiTags('Shipments (Merchant)')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('api/shipments')
export class ShipmentsController {
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

  @Post()
  @ApiOperation({
    summary: 'Step 1: Create a new shipment / order (registers order with OTO)',
  })
  async createShipment(
    @CurrentUser('id') merchantId: string,
    @Body() dto: CreateShipmentDto,
  ) {
    return this.shipmentsService.createShipment(merchantId, dto);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Bulk create multiple shipments' })
  async bulkCreate(
    @CurrentUser('id') merchantId: string,
    @Body() dto: BulkCreateOrderDto,
  ) {
    return this.shipmentsService.bulkCreateShipments(merchantId, dto);
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

  @Get()
  @ApiOperation({ summary: 'Get merchant shipments with filters' })
  @ApiQuery({ name: 'status', enum: ShipmentStatus, required: false })
  @ApiQuery({ name: 'searchTerm', required: false })
  async getShipments(
    @CurrentUser('id') merchantId: string,
    @Query() pagination: PaginationParamsDto,
    @Query('status') status?: ShipmentStatus,
    @Query('searchTerm') searchTerm?: string,
  ) {
    return this.shipmentsService.getShipments(
      merchantId,
      pagination,
      status,
      searchTerm,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get shipment details by ID' })
  async getShipmentDetails(
    @CurrentUser('id') merchantId: string,
    @Param('id') shipmentId: string,
  ) {
    return this.shipmentsService.getShipmentDetails(shipmentId, merchantId);
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

  @Put(':id/status')
  @ApiOperation({ summary: 'Update shipment status' })
  async updateStatus(
    @CurrentUser('id') merchantId: string,
    @Param('id') shipmentId: string,
    @Body() dto: UpdateShipmentStatusDto,
  ) {
    return this.shipmentsService.updateShipmentStatus(
      shipmentId,
      dto,
      merchantId,
    );
  }

  @Post(':id/hold')
  @ApiOperation({ summary: 'Put shipment on hold' })
  async holdShipment(
    @CurrentUser('id') merchantId: string,
    @Param('id') shipmentId: string,
  ) {
    return this.shipmentsService.holdShipment(shipmentId, merchantId);
  }

  @Post(':id/unhold')
  @ApiOperation({ summary: 'Unhold shipment and resume delivery' })
  async unholdShipment(
    @CurrentUser('id') merchantId: string,
    @Param('id') shipmentId: string,
  ) {
    return this.shipmentsService.unholdShipment(shipmentId, merchantId);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel shipment' })
  async cancelShipment(
    @CurrentUser('id') merchantId: string,
    @Param('id') shipmentId: string,
  ) {
    return this.shipmentsService.cancelShipment(shipmentId, merchantId);
  }
}
