import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ShipmentsService } from '../services/shipments.service';
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../users/enums/user.enum';

@ApiTags('Admin Analytics & Metrics')
@Controller('api/admin')
export class AdminAnalyticsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get('shipments/analytics')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({
    summary:
      'Get aggregate shipment analytics, status breakdown, and financial summaries (Admin)',
  })
  async getShipmentAnalyticsAdmin() {
    return this.shipmentsService.getShipmentAnalyticsAdmin();
  }

  @Get('dashboard')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({ summary: 'Get platform-wide dashboard overview (Admin)' })
  async getAdminDashboard() {
    return this.shipmentsService.getDashboardOverview();
  }
}
