import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../../modules/users/entities/user.entity';
import { UserRole } from '../../modules/users/enums/user.enum';
import { Location } from '../../modules/users/entities/location.entity';
import { Wallet } from '../../modules/wallet/entities/wallet.entity';
import { BankAccount } from '../../modules/wallet/entities/bank-account.entity';

@Injectable()
export class DatabaseSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseSeederService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
  ) {}

  async onApplicationBootstrap() {
    await this.seedLocations();
    await this.seedAdminAndDemoMerchant();
    await this.seedBankAccounts();
  }

  private async seedLocations() {
    const count = await this.locationRepository.count();
    if (count > 0) return;

    const cities = [
      { nameEn: 'Riyadh', nameAr: 'الرياض', code: 'RUH', type: 'City' },
      { nameEn: 'Jeddah', nameAr: 'جدة', code: 'JED', type: 'City' },
      { nameEn: 'Dammam', nameAr: 'الدمام', code: 'DMM', type: 'City' },
      { nameEn: 'Mecca', nameAr: 'مكة المكرمة', code: 'MAK', type: 'City' },
      { nameEn: 'Medina', nameAr: 'المدينة المنورة', code: 'MED', type: 'City' },
      { nameEn: 'Khobar', nameAr: 'الخبر', code: 'KHB', type: 'City' },
      { nameEn: 'Tabuk', nameAr: 'تبوك', code: 'TUU', type: 'City' },
      { nameEn: 'Abha', nameAr: 'أبها', code: 'AHB', type: 'City' },
    ];

    for (const city of cities) {
      await this.locationRepository.save(this.locationRepository.create(city));
    }
    this.logger.log('Seeded initial Saudi cities.');
  }

  private async seedAdminAndDemoMerchant() {
    // Seed Admin
    const adminEmail = 'admin@waslship.com';
    const adminExists = await this.userRepository.findOne({ where: { email: adminEmail } });

    if (!adminExists) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('AdminPass123!', salt);

      const admin = this.userRepository.create({
        email: adminEmail,
        phoneNumber: '+966500000000',
        fullName: 'Wasl Admin',
        role: UserRole.SuperAdmin,
        passwordHash,
        isActive: true,
        isPhoneVerified: true,
      });
      await this.userRepository.save(admin);
      this.logger.log('Seeded Admin account: admin@waslship.com / AdminPass123!');
    }

    // Seed Demo Merchant
    const merchantEmail = 'merchant@waslship.com';
    const merchantExists = await this.userRepository.findOne({ where: { email: merchantEmail } });

    if (!merchantExists) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('Merchant123!', salt);

      const merchant = this.userRepository.create({
        email: merchantEmail,
        phoneNumber: '+966555123456',
        fullName: 'Mohammed Al-Otaibi',
        companyName: 'Al-Otaibi Modern Commerce',
        role: UserRole.Merchant,
        passwordHash,
        isActive: true,
        isPhoneVerified: true,
      });
      const savedMerchant = await this.userRepository.save(merchant);

      const wallet = this.walletRepository.create({
        merchantId: savedMerchant.id,
        balance: 1500.0,
        reservedBalance: 0,
        pendingCodBalance: 320.0,
        currency: 'SAR',
      });
      await this.walletRepository.save(wallet);
      this.logger.log('Seeded Merchant account: merchant@waslship.com / Merchant123! with 1500 SAR wallet.');
    }
  }

  private async seedBankAccounts() {
    const count = await this.bankAccountRepository.count();
    if (count > 0) return;

    const initialAccounts = [
      {
        bankName: 'Al Rajhi Bank',
        accountHolderName: 'Wasl Logistics Ltd',
        accountNumber: '12345678901234',
        iban: 'SA0380000000608010167519',
        isActive: true,
      },
      {
        bankName: 'Saudi National Bank (SNB)',
        accountHolderName: 'Wasl Logistics Ltd',
        accountNumber: '98765432109876',
        iban: 'SA1010000000123456789012',
        isActive: true,
      },
    ];

    for (const acc of initialAccounts) {
      await this.bankAccountRepository.save(this.bankAccountRepository.create(acc));
    }
    this.logger.log('Seeded official company bank accounts.');
  }
}
