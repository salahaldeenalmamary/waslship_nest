import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
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
  constructor(private readonly usersService: UsersService) {}

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
