import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Headers,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ShipmentsService } from '../services/shipments.service';
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../users/enums/user.enum';
import { PaginationParamsDto } from '../../../common/dtos/pagination.dto';

@ApiTags('Webhooks & Integration Logs')
@Controller('api')
export class OtoWebhookController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

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
