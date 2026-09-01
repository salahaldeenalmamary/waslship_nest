import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
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
import { User } from '../../users/entities/user.entity';
import { ShipmentStatus } from '../enums/shipment.enum';
import {
  UpdateShipmentStatusDto,
  UpdateCarrierDetailsDto,
  AdminCancelShipmentDto,
  BulkUpdateShipmentStatusDto,
  AdminCreateShipmentDto,
  SelectDeliveryOptionDto,
} from '../dtos/shipment.dto';
import { CreateUserAddressDto } from '../../users/dtos/user.dto';
import { PaginationParamsDto } from '../../../common/dtos/pagination.dto';
import { TrackShipmentAudit } from '../decorators/shipment-audit.decorator';
import { ShipmentAuditInterceptor } from '../interceptors/shipment-audit.interceptor';

@ApiTags('Admin Shipments & Operations')
@Controller('api')
@UseInterceptors(ShipmentAuditInterceptor)
export class AdminShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post('admin/shipments')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @TrackShipmentAudit({
    action: 'ADMIN_INITIATE_SHIPMENT',
    description: 'Admin initiated a new shipment creation for merchant',
  })
  @ApiOperation({
    summary:
      'Create a shipment for a selected merchant using sender and receiver addresses belonging to that merchant (Admin)',
  })
  async createShipmentAdmin(
    @Body() dto: AdminCreateShipmentDto,
    @CurrentUser() admin: User,
  ) {
    return this.shipmentsService.createShipmentForMerchantByAdmin(dto, admin);
  }

  @Get('admin/merchants/:merchantId/addresses')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({
    summary:
      'Get all saved sender (pickup) and receiver (delivery) addresses for a selected merchant (Admin)',
  })
  async getMerchantAddressesAdmin(@Param('merchantId') merchantId: string) {
    return this.shipmentsService.getMerchantAddressesAdmin(merchantId);
  }

  @Post('admin/merchants/:merchantId/addresses')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({
    summary:
      'Create a new sender (pickup) or receiver (delivery) address for a selected merchant (Admin)',
  })
  async createMerchantAddressAdmin(
    @Param('merchantId') merchantId: string,
    @Body() dto: CreateUserAddressDto,
  ) {
    return this.shipmentsService.createMerchantAddressAdmin(merchantId, dto);
  }

  @Get('admin/shipments/:id/delivery-options')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({
    summary:
      'Step 2: Query available delivery companies & fee quotes for a shipment from OTO (Admin)',
  })
  async getDeliveryOptionsAdmin(@Param('id') shipmentId: string) {
    return this.shipmentsService.getDeliveryOptionsForShipment(shipmentId);
  }

  @Post('admin/shipments/:id/select-delivery-option')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @TrackShipmentAudit({
    action: 'ADMIN_SELECT_DELIVERY_OPTION',
    description: 'Admin selected carrier delivery option and completed booking',
  })
  @ApiOperation({
    summary:
      'Step 3: Select delivery company option and complete booking on OTO (Admin)',
  })
  async selectDeliveryOptionAdmin(
    @Param('id') shipmentId: string,
    @Body() dto: SelectDeliveryOptionDto,
    @CurrentUser() admin: User,
  ) {
    return this.shipmentsService.selectDeliveryOptionAdmin(
      shipmentId,
      dto.deliveryOptionId,
      admin,
    );
  }

  @Get('admin/shipments/:id/print-label')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({
    summary: 'Get printable Air Waybill / shipping label for a shipment (Admin)',
  })
  async printLabelAdmin(@Param('id') shipmentId: string) {
    return this.shipmentsService.getShipmentLabel(shipmentId);
  }

  @Get('admin/shipments/:id/tracking')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({
    summary: 'Get live tracking details for a specific shipment (Admin)',
  })
  async getTrackingAdmin(@Param('id') shipmentId: string) {
    const shipment = await this.shipmentsService.getShipmentDetails(shipmentId);
    return this.shipmentsService.trackShipment(shipment.trackingNumber);
  }

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

  @Get('admin/shipments/audit-logs')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({ summary: 'Get all platform administrative shipment audit logs (Admin)' })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'adminId', required: false })
  @ApiQuery({ name: 'shipmentId', required: false })
  async getAllAuditLogsAdmin(
    @Query() pagination: PaginationParamsDto,
    @Query('action') action?: string,
    @Query('adminId') adminId?: string,
    @Query('shipmentId') shipmentId?: string,
  ) {
    return this.shipmentsService.getAllAuditLogsAdmin(
      pagination,
      action,
      adminId,
      shipmentId,
    );
  }

  @Get('admin/shipments/:id/audit-logs')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({
    summary:
      'Get complete administrative audit history and timestamped state transitions for a shipment (Admin)',
  })
  async getShipmentAuditLogsAdmin(
    @Param('id') shipmentId: string,
    @Query() pagination: PaginationParamsDto,
  ) {
    return this.shipmentsService.getShipmentAuditLogs(shipmentId, pagination);
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
  @TrackShipmentAudit({
    action: 'ADMIN_UPDATE_STATUS',
    description: 'Admin manually updated shipment status',
  })
  @ApiOperation({ summary: 'Update status of a shipment (Admin)' })
  async updateShipmentStatusAdmin(
    @Param('id') shipmentId: string,
    @Body() dto: UpdateShipmentStatusDto,
    @CurrentUser() admin: User,
  ) {
    return this.shipmentsService.updateShipmentStatus(
      shipmentId,
      dto,
      undefined,
      admin,
      'ADMIN_PORTAL',
    );
  }

  @Post('admin/shipments/:id/cancel')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @TrackShipmentAudit({
    action: 'ADMIN_CANCEL_SHIPMENT',
    description: 'Admin cancelled shipment with reason',
  })
  @ApiOperation({ summary: 'Cancel a shipment with admin reason (Admin)' })
  async cancelShipmentAdmin(
    @Param('id') shipmentId: string,
    @Body() dto: AdminCancelShipmentDto,
    @CurrentUser() admin: User,
  ) {
    return this.shipmentsService.updateShipmentStatus(
      shipmentId,
      {
        status: ShipmentStatus.Cancelled,
        notes: `Cancelled by Admin (${admin?.fullName || admin?.email || 'Admin'}). Reason: ${dto.reason}`,
      },
      undefined,
      admin,
      'ADMIN_PORTAL',
    );
  }

  @Post('admin/shipments/:id/hold')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @TrackShipmentAudit({
    action: 'ADMIN_HOLD_SHIPMENT',
    description: 'Admin placed shipment on hold',
  })
  @ApiOperation({ summary: 'Place a shipment on hold (Admin)' })
  async holdShipmentAdmin(
    @Param('id') shipmentId: string,
    @CurrentUser() admin: User,
  ) {
    return this.shipmentsService.holdShipment(shipmentId, undefined, admin);
  }

  @Post('admin/shipments/:id/unhold')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @TrackShipmentAudit({
    action: 'ADMIN_UNHOLD_SHIPMENT',
    description: 'Admin released shipment from hold back to InTransit',
  })
  @ApiOperation({ summary: 'Release a shipment from hold back to InTransit (Admin)' })
  async unholdShipmentAdmin(
    @Param('id') shipmentId: string,
    @CurrentUser() admin: User,
  ) {
    return this.shipmentsService.unholdShipment(shipmentId, undefined, admin);
  }

  @Put('admin/shipments/:id/carrier')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @TrackShipmentAudit({
    action: 'ADMIN_UPDATE_CARRIER',
    description: 'Admin manually updated carrier and tracking information',
  })
  @ApiOperation({ summary: 'Manually update carrier and tracking details (Admin)' })
  async updateCarrierDetailsAdmin(
    @Param('id') shipmentId: string,
    @Body() dto: UpdateCarrierDetailsDto,
    @CurrentUser() admin: User,
  ) {
    return this.shipmentsService.updateCarrierDetailsAdmin(shipmentId, dto, admin);
  }

  @Post('admin/shipments/:id/sync-oto')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @TrackShipmentAudit({
    action: 'ADMIN_SYNC_OTO',
    description: 'Admin manually triggered re-sync with OTO gateway',
  })
  @ApiOperation({ summary: 'Force re-sync shipment with OTO Gateway (Admin)' })
  async syncOtoOrderAdmin(@Param('id') shipmentId: string) {
    return this.shipmentsService.syncOtoOrderAdmin(shipmentId);
  }

  @Post('admin/shipments/bulk-status')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @TrackShipmentAudit({
    action: 'ADMIN_BULK_UPDATE_STATUS',
    description: 'Admin executed bulk status update on multiple shipments',
  })
  @ApiOperation({ summary: 'Bulk update status for multiple shipments (Admin)' })
  async bulkUpdateShipmentStatusAdmin(
    @Body() dto: BulkUpdateShipmentStatusDto,
    @CurrentUser() admin: User,
  ) {
    return this.shipmentsService.bulkUpdateShipmentStatusAdmin(dto, admin);
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

