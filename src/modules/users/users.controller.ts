import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UserRole } from './enums/user.enum';
import {
  UpdateProfileDto,
  ChangePasswordDto,
  CreateUserAddressDto,
  UpdateUserAddressDto,
  UpdateUserStatusDto,
  CreateAdminDto,
} from './dtos/user.dto';
import { PaginationParamsDto } from '../../common/dtos/pagination.dto';

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

@ApiTags('Admin User Management')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.Admin, UserRole.SuperAdmin)
@Controller('api/admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get list of all users/merchants (Admin)' })
  @ApiQuery({ name: 'role', enum: UserRole, required: false })
  async getAllUsers(
    @Query() pagination: PaginationParamsDto,
    @Query('role') role?: UserRole,
  ) {
    return this.usersService.getAllUsers(pagination, role);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Activate or suspend user account (Admin)' })
  async updateUserStatus(
    @Param('id') userId: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.usersService.updateUserStatus(userId, dto.isActive);
  }

  @Post('create-admin')
  @ApiOperation({ summary: 'Create a new admin user (SuperAdmin/Admin)' })
  async createAdmin(@Body() dto: CreateAdminDto) {
    return this.usersService.createAdmin(dto);
  }
}

@ApiTags('Locations & Cities')
@Controller('api/locations')
export class LocationsController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get Saudi & regional cities and governorates' })
  @ApiQuery({ name: 'type', required: false, example: 'City' })
  async getLocations(@Query('type') type?: string) {
    return this.usersService.getLocations(type);
  }
}
