import {
  Controller,
  Get,
  Put,
  Post,
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
import { UsersService } from '../services/users.service';
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../enums/user.enum';
import {
  UpdateUserStatusDto,
  CreateAdminDto,
} from '../dtos/user.dto';
import { PaginationParamsDto } from '../../../common/dtos/pagination.dto';

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
