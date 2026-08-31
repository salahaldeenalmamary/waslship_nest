import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user.enum';
import {
  RegisterDto,
  LoginDto,
  VerifyOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from '../dtos/auth.dto';
import { Wallet } from '../../wallet/entities/wallet.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userRepository.findOne({
      where: [{ email: dto.email }, { phoneNumber: dto.phoneNumber }],
    });

    if (existing) {
      throw new ConflictException('Email or phone number already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.password, salt);

    const user = this.userRepository.create({
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      passwordHash,
      fullName: dto.fullName,
      companyName: dto.companyName,
      role: UserRole.Merchant,
      isPhoneVerified: true, // Default active for immediate use in demo
      otpCode: '123456',
      otpExpiryTime: new Date(Date.now() + 15 * 60 * 1000),
    });

    const savedUser = await this.userRepository.save(user);

    // Auto-create Wallet for the merchant
    const wallet = this.walletRepository.create({
      merchantId: savedUser.id,
      balance: 500.0, // Pre-fund trial balance for instant testing!
      reservedBalance: 0,
      pendingCodBalance: 0,
      currency: 'SAR',
    });
    await this.walletRepository.save(wallet);

    const token = this.generateToken(savedUser);

    return {
      user: this.sanitizeUser(savedUser),
      token,
      message: 'Registration successful. Wallet initialized with 500 SAR trial credit.',
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email, isDeleted: false },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    const token = this.generateToken(user);

    return {
      user: this.sanitizeUser(user),
      token,
    };
  }

  async adminLogin(dto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email, isDeleted: false },
    });

    if (!user || (user.role !== UserRole.Admin && user.role !== UserRole.SuperAdmin)) {
      throw new UnauthorizedException('Admin credentials required');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid admin credentials');
    }

    const token = this.generateToken(user);
    return {
      user: this.sanitizeUser(user),
      token,
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.userRepository.findOne({
      where: { phoneNumber: dto.phoneNumber },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.otpCode !== dto.otpCode) {
      throw new BadRequestException('Invalid verification code');
    }

    user.isPhoneVerified = true;
    user.otpCode = null;
    await this.userRepository.save(user);

    const token = this.generateToken(user);
    return {
      user: this.sanitizeUser(user),
      token,
      message: 'Phone verified successfully',
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      // Don't leak user presence
      return { message: 'If the email exists, an OTP code has been generated.' };
    }

    user.otpCode = '123456';
    user.otpExpiryTime = new Date(Date.now() + 15 * 60 * 1000);
    await this.userRepository.save(user);

    return {
      message: 'OTP has been sent (Demo OTP: 123456)',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user || user.otpCode !== dto.otpCode) {
      throw new BadRequestException('Invalid OTP or email');
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(dto.newPassword, salt);
    user.otpCode = null;
    await this.userRepository.save(user);

    return { message: 'Password updated successfully. You can now login.' };
  }

  private generateToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    };
    return this.jwtService.sign(payload);
  }

  public sanitizeUser(user: User) {
    const { passwordHash, otpCode, ...safeUser } = user;
    return safeUser;
  }
}
