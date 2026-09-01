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
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../users/enums/user.enum';
import { User } from '../../users/entities/user.entity';
import { ShipmentStatus } from '../enums/shipment.enum';
import {
  UpdateShipmentStatusDto,
  UpdateCarrierDetailsDto,
  AdminCancelShipmentDto,
  BulkUpdateShipmentStatusDto,
} from '../dtos';
import { PaginationParamsDto } from '../../../common/dtos/pagination.dto';
import { TrackShipmentAudit } from '../decorators/shipment-audit.decorator';
import { ShipmentAuditInterceptor } from '../interceptors/shipment-audit.interceptor';

@ApiTags('Admin Shipments & Operations')
@Controller('api/admin/shipments')
@UseInterceptors(ShipmentAuditInterceptor)
export class AdminShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({
    summary: 'Get all platform shipments with merchant details and filters (Admin)',
  })
  @ApiQuery({ name: 'status', enum: ShipmentStatus, required: false })
  @ApiQuery({ name: 'searchTerm', required: false })
  async getAllShipmentsAdmin(
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

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({ summary: 'Get detailed information for a specific shipment (Admin)' })
  async getShipmentDetailsAdmin(@Param('id') shipmentId: string) {
    return this.shipmentsService.getShipmentDetails(shipmentId);
  }

  @Put(':id/status')
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

  @Post(':id/cancel')
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

  @Post(':id/hold')
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

  @Post(':id/unhold')
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

  @Put(':id/carrier')
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
    return this.shipmentsService.updateCarrierDetailsAdmin(
      shipmentId,
      dto,
      admin,
    );
  }

  @Post(':id/sync-oto')
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

  @Post('bulk-status')
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
}
