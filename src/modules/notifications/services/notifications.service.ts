import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEntity } from '../entities/notification.entity';
import { DeviceToken } from '../entities/device-token.entity';
import {
  RegisterDeviceTokenDto,
  SendPushNotificationDto,
} from '../dtos/notification.dto';
import { PaginationParamsDto, PagedResult } from '../../../common/dtos/pagination.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepository: Repository<NotificationEntity>,
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepository: Repository<DeviceToken>,
  ) {}

  async registerDeviceToken(userId: string, dto: RegisterDeviceTokenDto) {
    let existing = await this.deviceTokenRepository.findOne({
      where: { token: dto.token },
    });

    if (existing) {
      existing.userId = userId;
      existing.platform = dto.platform;
      existing.isActive = true;
      return this.deviceTokenRepository.save(existing);
    }

    const created = this.deviceTokenRepository.create({
      userId,
      token: dto.token,
      platform: dto.platform,
      isActive: true,
    });
    return this.deviceTokenRepository.save(created);
  }

  async sendNotification(dto: SendPushNotificationDto) {
    const notif = this.notificationRepository.create({
      userId: dto.userId,
      title: dto.title,
      body: dto.body,
      type: dto.type,
      data: dto.data ? JSON.stringify(dto.data) : null,
      isRead: false,
    });

    const saved = await this.notificationRepository.save(notif);

    // Simulate / Trigger Firebase FCM push to registered active device tokens
    const tokens = await this.deviceTokenRepository.find({
      where: { userId: dto.userId, isActive: true },
    });

    if (tokens.length > 0) {
      this.logger.log(
        `Dispatched FCM Push to ${tokens.length} devices for User ${dto.userId}: [${dto.title}]`,
      );
    }

    return saved;
  }

  async getUserNotifications(userId: string, pagination: PaginationParamsDto) {
    const [items, total] = await this.notificationRepository.findAndCount({
      where: { userId, isDeleted: false },
      order: { createdAt: 'DESC' },
      skip: (pagination.pageNumber - 1) * pagination.pageSize,
      take: pagination.pageSize,
    });

    return new PagedResult(items, total, pagination.pageNumber, pagination.pageSize);
  }

  async getUnreadCount(userId: string) {
    const count = await this.notificationRepository.count({
      where: { userId, isRead: false, isDeleted: false },
    });
    return { unreadCount: count };
  }

  async markAsRead(userId: string, notificationId: string) {
    const notif = await this.notificationRepository.findOne({
      where: { id: notificationId, userId, isDeleted: false },
    });

    if (notif) {
      notif.isRead = true;
      notif.readAt = new Date();
      await this.notificationRepository.save(notif);
    }
    return { isSuccess: true };
  }

  async markAllAsRead(userId: string) {
    await this.notificationRepository.update(
      { userId, isRead: false, isDeleted: false },
      { isRead: true, readAt: new Date() },
    );
    return { isSuccess: true };
  }
}
