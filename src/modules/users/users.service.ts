import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { UserAddress } from './entities/user-address.entity';
import { Location } from './entities/location.entity';
import { UserRole } from './enums/user.enum';
import {
  UpdateProfileDto,
  ChangePasswordDto,
  CreateUserAddressDto,
  UpdateUserAddressDto,
  CreateAdminDto,
} from './dtos/user.dto';
import { PaginationParamsDto, PagedResult } from '../../common/dtos/pagination.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserAddress)
    private readonly addressRepository: Repository<UserAddress>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
  ) {}

  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId, isDeleted: false },
      relations: ['addresses'],
    });
    if (!user) throw new NotFoundException('User profile not found');
    const { passwordHash, otpCode, ...safeUser } = user;
    return safeUser;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.userRepository.findOne({
      where: { id: userId, isDeleted: false },
    });
    if (!user) throw new NotFoundException('User not found');

    if (dto.fullName) user.fullName = dto.fullName;
    if (dto.companyName !== undefined) user.companyName = dto.companyName;

    await this.userRepository.save(user);
    return this.getProfile(userId);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userRepository.findOne({
      where: { id: userId, isDeleted: false },
    });
    if (!user) throw new NotFoundException('User not found');

    const isMatch = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestException('Current password does not match');
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(dto.newPassword, salt);
    await this.userRepository.save(user);

    return { message: 'Password changed successfully' };
  }

  // Address Management
  async getUserAddresses(userId: string) {
    return this.addressRepository.find({
      where: { userId, isDeleted: false },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  async createAddress(userId: string, dto: CreateUserAddressDto) {
    if (dto.isDefault) {
      // Unset previous defaults
      await this.addressRepository.update(
        { userId, isDeleted: false },
        { isDefault: false },
      );
    }

    const address = this.addressRepository.create({
      ...dto,
      userId,
    });
    return this.addressRepository.save(address);
  }

  async updateAddress(
    userId: string,
    addressId: string,
    dto: UpdateUserAddressDto,
  ) {
    const address = await this.addressRepository.findOne({
      where: { id: addressId, userId, isDeleted: false },
    });
    if (!address) throw new NotFoundException('Address not found');

    if (dto.isDefault) {
      await this.addressRepository.update(
        { userId, isDeleted: false },
        { isDefault: false },
      );
    }

    Object.assign(address, dto);
    return this.addressRepository.save(address);
  }

  async deleteAddress(userId: string, addressId: string) {
    const address = await this.addressRepository.findOne({
      where: { id: addressId, userId, isDeleted: false },
    });
    if (!address) throw new NotFoundException('Address not found');
    address.isDeleted = true;
    await this.addressRepository.save(address);
    return { message: 'Address deleted successfully' };
  }

  // Admin Features
  async getAllUsers(pagination: PaginationParamsDto, role?: UserRole) {
    const query = this.userRepository
      .createQueryBuilder('user')
      .where('user.isDeleted = :isDeleted', { isDeleted: false });

    if (role) {
      query.andWhere('user.role = :role', { role });
    }

    query
      .orderBy('user.createdAt', 'DESC')
      .skip((pagination.pageNumber - 1) * pagination.pageSize)
      .take(pagination.pageSize);

    const [items, total] = await query.getManyAndCount();
    const sanitized = items.map((u) => {
      const { passwordHash, otpCode, ...safe } = u;
      return safe;
    });

    return new PagedResult(
      sanitized,
      total,
      pagination.pageNumber,
      pagination.pageSize,
    );
  }

  async updateUserStatus(userId: string, isActive: boolean) {
    const user = await this.userRepository.findOne({
      where: { id: userId, isDeleted: false },
    });
    if (!user) throw new NotFoundException('User not found');
    user.isActive = isActive;
    await this.userRepository.save(user);
    return { message: `User status set to ${isActive ? 'Active' : 'Inactive'}` };
  }

  async createAdmin(dto: CreateAdminDto) {
    const existing = await this.userRepository.findOne({
      where: [{ email: dto.email }, { phoneNumber: dto.phoneNumber }],
    });
    if (existing) throw new BadRequestException('Email or phone exists');

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.password, salt);

    const admin = this.userRepository.create({
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      fullName: dto.fullName,
      passwordHash,
      role: dto.role || UserRole.Admin,
      isActive: true,
      isPhoneVerified: true,
    });

    const saved = await this.userRepository.save(admin);
    const { passwordHash: _, ...safe } = saved;
    return safe;
  }

  // Locations / Cities
  async getLocations(type?: string) {
    const query = this.locationRepository.createQueryBuilder('loc');
    if (type) {
      query.where('loc.type = :type', { type });
    }
    return query.getMany();
  }
}
