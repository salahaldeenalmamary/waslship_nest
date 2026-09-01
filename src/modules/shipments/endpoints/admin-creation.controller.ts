import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ShipmentsService } from '../services/shipments.service';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../users/enums/user.enum';
import { User } from '../../users/entities/user.entity';
import {
  AdminCreateShipmentDto,
  SelectDeliveryOptionDto,
} from '../dtos';
import { CreateUserAddressDto } from '../../users/dtos/user.dto';
import { TrackShipmentAudit } from '../decorators/shipment-audit.decorator';
import { ShipmentAuditInterceptor } from '../interceptors/shipment-audit.interceptor';

@ApiTags('Admin Shipment Creation & Merchant Addresses')
@Controller('api/admin')
@UseInterceptors(ShipmentAuditInterceptor)
export class AdminCreationController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post('shipments')
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

  @Get('merchants/:merchantId/addresses')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({
    summary:
      'Get sender (pickup) and recipient (delivery) addresses for a specific merchant (Admin)',
  })
  async getMerchantAddressesAdmin(@Param('merchantId') merchantId: string) {
    return this.shipmentsService.getMerchantAddressesAdmin(merchantId);
  }

  @Post('merchants/:merchantId/addresses')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({
    summary: 'Add a new sender or recipient address for a merchant (Admin)',
  })
  async createMerchantAddressAdmin(
    @Param('merchantId') merchantId: string,
    @Body() dto: CreateUserAddressDto,
  ) {
    return this.shipmentsService.createMerchantAddressAdmin(merchantId, dto);
  }

  @Get('shipments/:id/delivery-options')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({
    summary:
      'Step 2: Query available delivery carriers & fee options for a shipment on OTO (Admin)',
  })
  async getDeliveryOptionsAdmin(@Param('id') shipmentId: string) {
    return this.shipmentsService.getDeliveryOptionsForShipment(shipmentId);
  }

  @Post('shipments/:id/select-delivery-option')
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

  @Get('shipments/:id/label')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({
    summary: 'Get printable shipping label / Air Waybill (AWB) URL (Admin)',
  })
  async getShipmentLabelAdmin(@Param('id') shipmentId: string) {
    return this.shipmentsService.getShipmentLabel(shipmentId);
  }
}
