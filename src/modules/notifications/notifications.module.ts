import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationEntity } from './entities/notification.entity';
import { DeviceToken } from './entities/device-token.entity';
import { NotificationsService } from './services/notifications.service';
import { NotificationsController } from './endpoints/notifications.controller';
import { NotificationEventsListener } from './listeners/notification-events.listener';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationEntity, DeviceToken])],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationEventsListener],
  exports: [NotificationsService, TypeOrmModule],
})
export class NotificationsModule {}
