import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { UsersService } from './users.service';
import { StorageService } from '../storage/storage.service';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  UpdateProfileDto,
  ChangePasswordDto,
  CreateUserAddressDto,
  UpdateUserAddressDto,
} from './dtos/user.dto';

@ApiTags('User Profile & Addresses')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('api/users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly storageService: StorageService,
  ) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get logged in user profile' })
  async getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update profile details' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Post('profile/avatar')
  @ApiOperation({ summary: 'Upload and update user profile avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 })], // 5MB
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
    @Req() req: Request,
  ) {
    // 1. Process and record polymorphic media attachment
    const attachment = await this.storageService.handleFileUpload(
      file,
      req,
      {
        entityType: 'User',
        entityId: userId,
        tag: 'avatar',
      },
      userId,
    );

    // 2. Update cached avatar URL on User record
    await this.usersService.updateAvatar(userId, attachment.url);

    return {
      message: 'Avatar uploaded and profile updated successfully',
      avatarUrl: attachment.url,
      attachment,
    };
  }

  @Delete('profile/avatar')
  @ApiOperation({ summary: 'Remove user profile avatar' })
  async removeAvatar(@CurrentUser('id') userId: string) {
    return this.usersService.removeAvatar(userId);
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change user password' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(userId, dto);
  }

  @Get('addresses')
  @ApiOperation({ summary: 'Get all saved addresses for current user' })
  async getAddresses(@CurrentUser('id') userId: string) {
    return this.usersService.getUserAddresses(userId);
  }

  @Post('addresses')
  @ApiOperation({ summary: 'Add a new pickup or delivery address' })
  async createAddress(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateUserAddressDto,
  ) {
    return this.usersService.createAddress(userId, dto);
  }

  @Put('addresses/:id')
  @ApiOperation({ summary: 'Update saved address' })
  async updateAddress(
    @CurrentUser('id') userId: string,
    @Param('id') addressId: string,
    @Body() dto: UpdateUserAddressDto,
  ) {
    return this.usersService.updateAddress(userId, addressId, dto);
  }

  @Delete('addresses/:id')
  @ApiOperation({ summary: 'Delete saved address' })
  async deleteAddress(
    @CurrentUser('id') userId: string,
    @Param('id') addressId: string,
  ) {
    return this.usersService.deleteAddress(userId, addressId);
  }
}
