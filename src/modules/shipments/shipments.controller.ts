import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Headers,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ShipmentsService } from './shipments.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/enums/user.enum';
import { ShipmentStatus } from './enums/shipment.enum';
import {
  CreateShipmentDto,
  BulkCreateOrderDto,
  UpdateShipmentStatusDto,
  DeliveryFeeCheckDto,
} from './dtos/shipment.dto';
import { PaginationParamsDto } from '../../common/dtos/pagination.dto';

@ApiTags('Shipments (Merchant)')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('api/shipments')
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new shipment / order' })
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
}

@ApiTags('Admin Operations & Webhooks')
@Controller('api')
export class AdminShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get('admin/shipments')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({ summary: 'Get all platform shipments (Admin)' })
  async getAllAdminShipments(
    @Query() pagination: PaginationParamsDto,
    @Query('status') status?: ShipmentStatus,
    @Query('searchTerm') searchTerm?: string,
  ) {
    return this.shipmentsService.getAllShipmentsAdmin(
      pagination,
      status,
      searchTerm,
    );
  }

  @Get('admin/dashboard')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({ summary: 'Get platform-wide dashboard overview (Admin)' })
  async getAdminDashboard() {
    return this.shipmentsService.getDashboardOverview();
  }

  @Get('dashboard/overview')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get merchant dashboard metrics' })
  async getMerchantDashboard(@CurrentUser('id') merchantId: string) {
    return this.shipmentsService.getDashboardOverview(merchantId);
  }

  @Post('webhooks/oto')
  @ApiOperation({ summary: 'Handle OTO Carrier Status Webhook' })
  @ApiHeader({ name: 'x-oto-signature', required: false })
  async otoWebhook(
    @Body() payload: any,
    @Headers('x-oto-signature') signature: string = '',
    @Req() req: any,
  ) {
    return this.shipmentsService.handleOtoWebhook(
      payload,
      signature,
      JSON.stringify(payload),
    );
  }

  @Get('admin/webhooks/logs')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({ summary: 'View OTO Webhook integration logs (Admin)' })
  async getWebhookLogs(@Query() pagination: PaginationParamsDto) {
    return this.shipmentsService.getWebhookLogs(pagination);
  }
}
