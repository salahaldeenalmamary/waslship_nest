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
} from '../dtos';
import { PaginationParamsDto } from '../../../common/dtos/pagination.dto';

@ApiTags('Shipments (Merchant)')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('api')
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post('shipments')
  @ApiOperation({
    summary: 'Step 1: Create a new shipment / order (registers order with OTO)',
  })
  async createShipment(
    @CurrentUser('id') merchantId: string,
    @Body() dto: CreateShipmentDto,
  ) {
    return this.shipmentsService.createShipment(merchantId, dto);
  }

  @Post('shipments/bulk')
  @ApiOperation({ summary: 'Bulk create multiple shipments' })
  async bulkCreate(
    @CurrentUser('id') merchantId: string,
    @Body() dto: BulkCreateOrderDto,
  ) {
    return this.shipmentsService.bulkCreateShipments(merchantId, dto);
  }

  @Get('shipments')
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

  @Get('dashboard/overview')
  @ApiOperation({ summary: 'Get merchant dashboard metrics' })
  async getMerchantDashboard(@CurrentUser('id') merchantId: string) {
    return this.shipmentsService.getDashboardOverview(merchantId);
  }

  @Get('shipments/:id')
  @ApiOperation({ summary: 'Get shipment details by ID' })
  async getShipmentDetails(
    @CurrentUser('id') merchantId: string,
    @Param('id') shipmentId: string,
  ) {
    return this.shipmentsService.getShipmentDetails(shipmentId, merchantId);
  }

  @Put('shipments/:id/status')
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

  @Post('shipments/:id/hold')
  @ApiOperation({ summary: 'Put shipment on hold' })
  async holdShipment(
    @CurrentUser('id') merchantId: string,
    @Param('id') shipmentId: string,
  ) {
    return this.shipmentsService.holdShipment(shipmentId, merchantId);
  }

  @Post('shipments/:id/unhold')
  @ApiOperation({ summary: 'Unhold shipment and resume delivery' })
  async unholdShipment(
    @CurrentUser('id') merchantId: string,
    @Param('id') shipmentId: string,
  ) {
    return this.shipmentsService.unholdShipment(shipmentId, merchantId);
  }

  @Post('shipments/:id/cancel')
  @ApiOperation({ summary: 'Cancel shipment' })
  async cancelShipment(
    @CurrentUser('id') merchantId: string,
    @Param('id') shipmentId: string,
  ) {
    return this.shipmentsService.cancelShipment(shipmentId, merchantId);
  }
}
