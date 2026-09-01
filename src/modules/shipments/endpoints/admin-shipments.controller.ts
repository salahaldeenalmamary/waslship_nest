import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ShipmentsService } from '../services/shipments.service';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../users/enums/user.enum';
import { ShipmentStatus } from '../enums/shipment.enum';
import {
  UpdateShipmentStatusDto,
  UpdateCarrierDetailsDto,
  AdminCancelShipmentDto,
  BulkUpdateShipmentStatusDto,
} from '../dtos/shipment.dto';
import { PaginationParamsDto } from '../../../common/dtos/pagination.dto';

@ApiTags('Admin Shipments & Operations')
@Controller('api')
export class AdminShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get('admin/shipments')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({ summary: 'Get all platform shipments with status & search filtering (Admin)' })
  @ApiQuery({ name: 'status', enum: ShipmentStatus, required: false })
  @ApiQuery({ name: 'searchTerm', required: false })
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

  @Get('admin/shipments/analytics')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({ summary: 'Get detailed shipment analytics and financial breakdown (Admin)' })
  async getShipmentAnalytics() {
    return this.shipmentsService.getShipmentAnalyticsAdmin();
  }

  @Get('admin/shipments/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({ summary: 'Get detailed information for a specific shipment (Admin)' })
  async getShipmentDetailsAdmin(@Param('id') shipmentId: string) {
    return this.shipmentsService.getShipmentDetails(shipmentId);
  }

  @Put('admin/shipments/:id/status')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({ summary: 'Update status of a shipment (Admin)' })
  async updateShipmentStatusAdmin(
    @Param('id') shipmentId: string,
    @Body() dto: UpdateShipmentStatusDto,
  ) {
    return this.shipmentsService.updateShipmentStatus(shipmentId, dto);
  }

  @Post('admin/shipments/:id/cancel')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({ summary: 'Cancel a shipment with admin reason (Admin)' })
  async cancelShipmentAdmin(
    @Param('id') shipmentId: string,
    @Body() dto: AdminCancelShipmentDto,
  ) {
    return this.shipmentsService.updateShipmentStatus(shipmentId, {
      status: ShipmentStatus.Cancelled,
      notes: `Cancelled by Admin. Reason: ${dto.reason}`,
    });
  }

  @Post('admin/shipments/:id/hold')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({ summary: 'Place a shipment on hold (Admin)' })
  async holdShipmentAdmin(@Param('id') shipmentId: string) {
    return this.shipmentsService.holdShipment(shipmentId);
  }

  @Post('admin/shipments/:id/unhold')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({ summary: 'Release a shipment from hold back to InTransit (Admin)' })
  async unholdShipmentAdmin(@Param('id') shipmentId: string) {
    return this.shipmentsService.unholdShipment(shipmentId);
  }

  @Put('admin/shipments/:id/carrier')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({ summary: 'Manually update carrier and tracking details (Admin)' })
  async updateCarrierDetailsAdmin(
    @Param('id') shipmentId: string,
    @Body() dto: UpdateCarrierDetailsDto,
  ) {
    return this.shipmentsService.updateCarrierDetailsAdmin(shipmentId, dto);
  }

  @Post('admin/shipments/:id/sync-oto')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({ summary: 'Force re-sync shipment with OTO Gateway (Admin)' })
  async syncOtoOrderAdmin(@Param('id') shipmentId: string) {
    return this.shipmentsService.syncOtoOrderAdmin(shipmentId);
  }

  @Post('admin/shipments/bulk-status')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({ summary: 'Bulk update status for multiple shipments (Admin)' })
  async bulkUpdateShipmentStatusAdmin(@Body() dto: BulkUpdateShipmentStatusDto) {
    return this.shipmentsService.bulkUpdateShipmentStatusAdmin(dto);
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

