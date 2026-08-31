import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from '../services/notifications.service';
import { CurrentUser } from '../../auth/current-user.decorator';
import {
  RegisterDeviceTokenDto,
  SendPushNotificationDto,
} from '../dtos/notification.dto';
import { PaginationParamsDto } from '../../../common/dtos/pagination.dto';
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../users/enums/user.enum';

@ApiTags('Notifications & FCM Push')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('api/notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get user notifications list' })
  async getNotifications(
    @CurrentUser('id') userId: string,
    @Query() pagination: PaginationParamsDto,
  ) {
    return this.notificationsService.getUserNotifications(userId, pagination);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get count of unread notifications' })
  async getUnreadCount(@CurrentUser('id') userId: string) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @Put(':id/read')
  @ApiOperation({ summary: 'Mark specific notification as read' })
  async markAsRead(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markAsRead(userId, id);
  }

  @Put('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Post('devices/register')
  @ApiOperation({ summary: 'Register FCM device token for push notifications' })
  async registerDevice(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    return this.notificationsService.registerDeviceToken(userId, dto);
  }

  @Post('admin/send-push')
  @UseGuards(RolesGuard)
  @Roles(UserRole.Admin, UserRole.SuperAdmin)
  @ApiOperation({ summary: 'Send targeted push notification (Admin)' })
  async sendPush(@Body() dto: SendPushNotificationDto) {
    return this.notificationsService.sendNotification(dto);
  }
}
