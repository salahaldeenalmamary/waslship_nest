import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Req,
  UseGuards,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { StorageService } from '../services/storage.service';
import { CurrentUser } from '../../auth/current-user.decorator';
import {
  UploadMediaOptionsDto,
  AttachMediaDto,
  QueryMediaAttachmentsDto,
} from '../dtos/storage.dto';

@ApiTags('Storage & Media')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('api/storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload')
  @ApiOperation({
    summary: 'Upload a single media file and optionally attach it to an entity',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        entityType: {
          type: 'string',
          example: 'Shipment',
          description: 'Optional parent entity type (e.g. Shipment, User, BankTransferPayment)',
        },
        entityId: {
          type: 'string',
          example: 'd3b07384-d113-460b-93ae-c79a4da9001b',
          description: 'Optional parent entity UUID/ID',
        },
        tag: {
          type: 'string',
          example: 'receipt',
          description: 'Optional tag / purpose of the file (e.g. receipt, avatar, proof_of_delivery)',
        },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 })], // 10MB
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
    @Body() options: UploadMediaOptionsDto,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    return this.storageService.handleFileUpload(file, req, options, userId);
  }

  @Post('upload-multiple')
  @ApiOperation({
    summary: 'Upload multiple media files and optionally attach them to an entity',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
        entityType: {
          type: 'string',
          example: 'Shipment',
        },
        entityId: {
          type: 'string',
          example: 'd3b07384-d113-460b-93ae-c79a4da9001b',
        },
        tag: {
          type: 'string',
          example: 'proof_of_delivery',
        },
      },
      required: ['files'],
    },
  })
  @UseInterceptors(FilesInterceptor('files', 10)) // Max 10 files at once
  uploadMultipleFiles(
    @UploadedFiles(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 })], // 10MB per file
        fileIsRequired: true,
      }),
    )
    files: Express.Multer.File[],
    @Body() options: UploadMediaOptionsDto,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    return this.storageService.handleMultipleFilesUpload(files, req, options, userId);
  }

  @Get('media')
  @ApiOperation({ summary: 'List and filter polymorphic media attachments' })
  getMediaAttachments(
    @Query() query: QueryMediaAttachmentsDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.storageService.getMediaAttachments(query, userId);
  }

  @Get('media/:id')
  @ApiOperation({ summary: 'Get details of a media attachment by ID' })
  getMediaById(@Param('id') id: string) {
    return this.storageService.getMediaById(id);
  }

  @Get('entities/:entityType/:entityId')
  @ApiOperation({
    summary: 'Get all media attachments for a specific entity (e.g. Shipment, User, Payment)',
  })
  @ApiQuery({ name: 'tag', required: false, example: 'receipt' })
  getMediaForEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query('tag') tag?: string,
  ) {
    return this.storageService.getMediaForEntity(entityType, entityId, tag);
  }

  @Put('media/:id/attach')
  @ApiOperation({
    summary: 'Attach an existing media record to an entity with a specific tag',
  })
  attachMediaToEntity(@Param('id') id: string, @Body() dto: AttachMediaDto) {
    return this.storageService.attachMediaToEntity(id, dto);
  }

  @Put('media/:id/detach')
  @ApiOperation({ summary: 'Detach a media record from its associated entity' })
  detachMedia(@Param('id') id: string) {
    return this.storageService.detachMedia(id);
  }

  @Delete('media/:id')
  @ApiOperation({ summary: 'Delete a media attachment' })
  @ApiQuery({
    name: 'hardDelete',
    type: 'boolean',
    required: false,
    description: 'Permanently remove from database and disk if true',
  })
  deleteMedia(
    @Param('id') id: string,
    @Query('hardDelete') hardDelete?: string,
  ) {
    return this.storageService.deleteMedia(id, hardDelete === 'true');
  }
}
