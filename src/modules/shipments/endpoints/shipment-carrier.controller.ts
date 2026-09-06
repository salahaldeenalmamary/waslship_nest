import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiProduces,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ShipmentsService } from '../services/shipments.service';
import { MultiCarrierRegistryService } from '../services/carriers/multi-carrier-registry.service';
import { ShipmentBatchImporterService } from '../services/shipment-batch-importer.service';
import { OtoClient } from '../services/oto.client';
import { CurrentUser } from '../../auth/current-user.decorator';
import {
  CreateOtoShipmentDto,
  SelectDeliveryOptionDto,
  PrepareOtoPayloadDto,
  EstimateShipmentRateDto,
  ImportShipmentsCsvDto,
} from '../dtos';

@ApiTags('Shipments (OTO Carrier Gateway)')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('api/shipments')
export class ShipmentCarrierController {
  constructor(
    private readonly shipmentsService: ShipmentsService,
    private readonly carrierRegistry: MultiCarrierRegistryService,
    private readonly batchImporter: ShipmentBatchImporterService,
    private readonly otoClient: OtoClient,
  ) {}

  @Get('carriers')
  @ApiOperation({
    summary:
      'Carrier Integration: Dynamically fetch active delivery companies directly from the OTO API',
  })
  async getSupportedCarriers() {
    const carriers = await this.otoClient.getDeliveryCompaniesFromOtoApi();
    return {
      count: carriers.length,
      carriers,
    };
  }

  @Post('estimate-rate')
  @ApiOperation({
    summary:
      'Shipment Rate Estimator: Calculate estimated shipping fees directly via OTO Gateway API',
  })
  async estimateRate(@Body() dto: EstimateShipmentRateDto) {
    return this.otoClient.estimateRate(dto);
  }

  @Post('oto/refresh-token')
  @ApiOperation({
    summary:
      'OTO Authentication: Manually trigger an access token renewal via OTO Refresh Token',
  })
  async refreshOtoToken() {
    const token = await this.otoClient.getValidAccessToken(true);
    return {
      success: true,
      message: 'Successfully refreshed OTO access token using OTO Refresh Token',
      tokenPreview: `${token.substring(0, 8)}...${token.substring(token.length - 4)}`,
    };
  }

  @Get('import-csv/template')
  @ApiOperation({
    summary:
      'Bulk CSV Import: Directly download ready-to-use CSV template file (Bold-style direct download)',
  })
  @ApiProduces('text/csv', 'application/json')
  @ApiQuery({
    name: 'format',
    required: false,
    enum: ['csv', 'json'],
    description:
      'Format of the template. Defaults to direct downloadable .csv file, or "json" for raw metadata.',
  })
  async getCsvImportTemplate(
    @Res() res: Response,
    @Query('format') format?: string,
  ) {
    const template = this.batchImporter.getSampleCsvTemplate();

    if (format === 'json') {
      return res.status(200).json({
        isSuccess: true,
        statusCode: 200,
        data: template,
      });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${template.filename}"`,
    );
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Prepend UTF-8 BOM (\uFEFF) for immediate compatibility with Excel and Arabic text
    return res.status(200).send(`\uFEFF${template.csvContent}`);
  }

  @Post('import-csv')
  @ApiOperation({
    summary:
      'Automated Batch/Bulk Shipment Creation: Process CSV dataset with strict row-by-row validation & error reporting',
  })
  async importShipmentsFromCsv(
    @CurrentUser('id') merchantId: string,
    @Body() dto: ImportShipmentsCsvDto,
  ) {
    return this.batchImporter.processBatchImport(merchantId, dto);
  }

  @Post('oto/prepare-payload')
  @ApiOperation({
    summary:
      'Helper: Fetch and validate UserAddress details based on pickupAddressId and deliveryAddressId to prepare OTO createShipment payload',
  })
  async prepareOtoPayload(@Body() dto: PrepareOtoPayloadDto) {
    return this.shipmentsService.prepareOtoCreateShipmentPayload(
      dto.pickupAddressId,
      dto.deliveryAddressId,
      dto,
    );
  }

  @Get('oto/delivery-fee/:orderId')
  @ApiOperation({
    summary:
      'Step 2: Get available delivery companies & deliveryOptionId options for an order from OTO',
  })
  async getOtoDeliveryFee(@Param('orderId') orderId: string) {
    return this.shipmentsService.getDeliveryFeeForOrder(orderId);
  }

  @Post('oto/create-shipment')
  @ApiOperation({
    summary:
      'Step 3: Complete shipment on OTO with orderId and selected deliveryOptionId',
  })
  async createOtoShipment(@Body() dto: CreateOtoShipmentDto) {
    return this.shipmentsService.createOtoShipment(
      dto.orderId,
      dto.deliveryOptionId,
    );
  }

  @Get(':id/delivery-options')
  @ApiOperation({
    summary:
      'Step 2 (By Shipment ID): Query available delivery companies & fee options for a specific shipment',
  })
  async getDeliveryOptionsForShipment(
    @CurrentUser('id') merchantId: string,
    @Param('id') shipmentId: string,
  ) {
    return this.shipmentsService.getDeliveryOptionsForShipment(
      shipmentId,
      merchantId,
    );
  }

  @Post(':id/select-delivery-option')
  @ApiOperation({
    summary:
      'Step 3 (By Shipment ID): Select deliveryOptionId and finalize booking with OTO carrier',
  })
  async selectDeliveryOption(
    @CurrentUser('id') merchantId: string,
    @Param('id') shipmentId: string,
    @Body() dto: SelectDeliveryOptionDto,
  ) {
    return this.shipmentsService.selectDeliveryOptionForShipment(
      shipmentId,
      merchantId,
      dto.deliveryOptionId,
    );
  }

  @Get(':id/label')
  @ApiOperation({
    summary: 'Get printable shipping label / Air Waybill (AWB) URL',
  })
  async getShipmentLabel(
    @CurrentUser('id') merchantId: string,
    @Param('id') shipmentId: string,
  ) {
    return this.shipmentsService.getShipmentLabel(shipmentId, merchantId);
  }
}
