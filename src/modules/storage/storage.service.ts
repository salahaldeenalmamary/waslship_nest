import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import * as Minio from 'minio';
import { MediaAttachment } from './entities/media-attachment.entity';
import {
  UploadMediaOptionsDto,
  AttachMediaDto,
  QueryMediaAttachmentsDto,
} from './dtos/storage.dto';
import { PagedResult } from '../../common/dtos/pagination.dto';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private minioClient: Minio.Client | null = null;
  private bucketInitialized = false;

  constructor(
    @InjectRepository(MediaAttachment)
    private readonly mediaRepo: Repository<MediaAttachment>,
  ) {}

  private getMinioClient(): Minio.Client | null {
    const driver = process.env.STORAGE_DRIVER || 'local';
    if (driver !== 'minio') return null;

    if (!this.minioClient) {
      const endPoint = process.env.MINIO_ENDPOINT || 'minio';
      const port = parseInt(process.env.MINIO_PORT || '9000', 10);
      const useSSL = process.env.MINIO_USE_SSL === 'true';
      const accessKey = process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || 'minioadmin';
      const secretKey = process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || 'minioadmin123';

      this.minioClient = new Minio.Client({
        endPoint,
        port,
        useSSL,
        accessKey,
        secretKey,
      });

      this.logger.log(`Initialized MinIO client connected to ${endPoint}:${port} (SSL: ${useSSL})`);
    }
    return this.minioClient;
  }

  private async ensureBucketExists(client: Minio.Client, bucket: string) {
    if (this.bucketInitialized) return;
    try {
      const exists = await client.bucketExists(bucket);
      if (!exists) {
        await client.makeBucket(bucket, process.env.MINIO_REGION || 'us-east-1');
        this.logger.log(`Created MinIO bucket "${bucket}"`);

        // Set bucket policy to allow public read downloads for assets
        const policy = {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetBucketLocation', 's3:ListBucket'],
              Resource: [`arn:aws:s3:::${bucket}`],
            },
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${bucket}/*`],
            },
          ],
        };
        await client.setBucketPolicy(bucket, JSON.stringify(policy));
      }
      this.bucketInitialized = true;
    } catch (err: any) {
      this.logger.warn(`MinIO bucket check failed for "${bucket}": ${err.message}`);
    }
  }

  /**
   * Processes a single uploaded file and records a polymorphic MediaAttachment in the database.
   * Stores directly in MinIO Object Storage (production/Docker) or local disk (development).
   */
  async handleFileUpload(
    file: Express.Multer.File,
    req: Request,
    options?: UploadMediaOptionsDto,
    uploadedById?: string,
  ): Promise<MediaAttachment> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const ext = extname(file.originalname || '') || '.bin';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const filename = file.filename || `${file.fieldname || 'file'}-${uniqueSuffix}${ext}`;
    const mimeType = file.mimetype || 'application/octet-stream';
    const size = file.size || (file.buffer ? file.buffer.length : 0);

    const minio = this.getMinioClient();
    const bucket = process.env.MINIO_BUCKET || 'waslship-media';

    let fileUrl: string;
    let filePath: string = file.path || '';

    if (minio) {
      // --- MinIO Native Object Storage Upload ---
      await this.ensureBucketExists(minio, bucket);

      const objectKey = options?.tag ? `${options.tag}/${filename}` : `uploads/${filename}`;
      const fileBuffer =
        file.buffer ||
        (file.path && existsSync(file.path) ? require('fs').readFileSync(file.path) : null);

      if (!fileBuffer) {
        throw new BadRequestException('File buffer is required for MinIO upload');
      }

      await minio.putObject(bucket, objectKey, fileBuffer, fileBuffer.length, {
        'Content-Type': mimeType,
      });

      const publicBaseUrl = process.env.MINIO_PUBLIC_URL?.replace(/\/$/, '');
      if (publicBaseUrl) {
        fileUrl = `${publicBaseUrl}/${objectKey}`;
      } else {
        const port = process.env.MINIO_PORT || '9000';
        const host = req.get('host')?.split(':')[0] || 'localhost';
        fileUrl = `http://${host}:${port}/${bucket}/${objectKey}`;
      }

      filePath = `minio://${bucket}/${objectKey}`;
      this.logger.log(`Uploaded file to MinIO: ${fileUrl}`);
    } else {
      // --- Local Disk Upload ---
      const uploadDir = join(process.cwd(), 'public', 'uploads');
      if (!existsSync(uploadDir)) {
        mkdirSync(uploadDir, { recursive: true });
      }

      filePath = file.path || join(uploadDir, filename);
      if (!file.path && file.buffer) {
        writeFileSync(filePath, file.buffer);
      }

      const protocol = req.protocol || 'http';
      const host = req.get('host') || 'localhost:3000';
      fileUrl = `${protocol}://${host}/uploads/${filename}`;
    }

    const attachment = this.mediaRepo.create({
      fileName: filename,
      originalName: file.originalname || filename,
      mimeType,
      size,
      url: fileUrl,
      filePath,
      entityType: options?.entityType,
      entityId: options?.entityId,
      tag: options?.tag,
      uploadedById,
    });

    return this.mediaRepo.save(attachment);
  }

  /**
   * Processes multiple uploaded files and creates polymorphic MediaAttachment records.
   */
  async handleMultipleFilesUpload(
    files: Express.Multer.File[],
    req: Request,
    options?: UploadMediaOptionsDto,
    uploadedById?: string,
  ): Promise<MediaAttachment[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    const attachments: MediaAttachment[] = [];
    for (const file of files) {
      const saved = await this.handleFileUpload(file, req, options, uploadedById);
      attachments.push(saved);
    }
    return attachments;
  }

  /**
   * Queries media attachments with pagination and filters.
   */
  async getMediaAttachments(
    query: QueryMediaAttachmentsDto,
    uploadedById?: string,
  ): Promise<PagedResult<MediaAttachment>> {
    const { pageNumber = 1, pageSize = 10, entityType, entityId, tag } = query;

    const qb = this.mediaRepo.createQueryBuilder('media');
    qb.where('media.isDeleted = :isDeleted', { isDeleted: false });

    if (entityType) {
      qb.andWhere('media.entityType = :entityType', { entityType });
    }

    if (entityId) {
      qb.andWhere('media.entityId = :entityId', { entityId });
    }

    if (tag) {
      qb.andWhere('media.tag = :tag', { tag });
    }

    if (uploadedById) {
      qb.andWhere('media.uploadedById = :uploadedById', { uploadedById });
    }

    qb.orderBy('media.createdAt', 'DESC');
    qb.skip((pageNumber - 1) * pageSize).take(pageSize);

    const [items, totalCount] = await qb.getManyAndCount();

    return new PagedResult<MediaAttachment>(items, totalCount, pageNumber, pageSize);
  }

  /**
   * Retrieves a single media attachment by its ID.
   */
  async getMediaById(id: string): Promise<MediaAttachment> {
    const media = await this.mediaRepo.findOne({
      where: { id, isDeleted: false },
    });

    if (!media) {
      throw new NotFoundException(`Media attachment with ID "${id}" not found`);
    }

    return media;
  }

  /**
   * Retrieves all media attachments associated with a specific entity (e.g. Shipment, User, Payment).
   */
  async getMediaForEntity(
    entityType: string,
    entityId: string,
    tag?: string,
  ): Promise<MediaAttachment[]> {
    const where: any = {
      entityType,
      entityId,
      isDeleted: false,
    };

    if (tag) {
      where.tag = tag;
    }

    return this.mediaRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Attaches an existing uploaded media record to an entity.
   */
  async attachMediaToEntity(id: string, dto: AttachMediaDto): Promise<MediaAttachment> {
    const media = await this.getMediaById(id);

    media.entityType = dto.entityType;
    media.entityId = dto.entityId;
    if (dto.tag !== undefined) {
      media.tag = dto.tag;
    }

    return this.mediaRepo.save(media);
  }

  /**
   * Detaches a media record from its associated entity without deleting the file.
   */
  async detachMedia(id: string): Promise<MediaAttachment> {
    const media = await this.getMediaById(id);

    media.entityType = undefined;
    media.entityId = undefined;
    media.tag = undefined;

    return this.mediaRepo.save(media);
  }

  /**
   * Deletes a media attachment record. Soft deletes by default, or hard deletes from DB & disk.
   */
  async deleteMedia(id: string, hardDelete = false): Promise<{ success: boolean; message: string }> {
    const media = await this.mediaRepo.findOne({ where: { id } });

    if (!media) {
      throw new NotFoundException(`Media attachment with ID "${id}" not found`);
    }

    if (hardDelete) {
      if (media.filePath && existsSync(media.filePath)) {
        try {
          unlinkSync(media.filePath);
        } catch (err) {
          this.logger.warn(`Could not unlink file ${media.filePath}: ${err.message}`);
        }
      }
      await this.mediaRepo.remove(media);
      return { success: true, message: 'Media permanently deleted' };
    }

    media.isDeleted = true;
    await this.mediaRepo.save(media);
    return { success: true, message: 'Media deleted successfully' };
  }
}
