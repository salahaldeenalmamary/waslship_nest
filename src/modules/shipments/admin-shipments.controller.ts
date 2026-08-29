import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Headers,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ShipmentsService } from './shipments.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/enums/user.enum';
import { ShipmentStatus } from './enums/shipment.enum';
import { PaginationParamsDto } from '../../common/dtos/pagination.dto';

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
