import {
  Controller,
  Get,
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
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../users/enums/user.enum';
import { PaginationParamsDto } from '../../../common/dtos/pagination.dto';

@ApiTags('Admin Shipment Audit Logs')
@Controller('api/admin/shipments')
export class AdminAuditController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get('audit-logs')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({
    summary: 'Get all platform administrative shipment audit logs (Admin)',
  })
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

  @Get(':id/audit-logs')
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
}
