import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserAddress } from './entities/user-address.entity';
import { UserBankAccount } from './entities/user-bank-account.entity';
import { Location } from './entities/location.entity';
import { StorageModule } from '../storage/storage.module';
import { UsersService } from './services/users.service';
import { UserBankAccountService } from './services/user-bank-account.service';
import { UsersController } from './endpoints/users.controller';
import { AdminUsersController } from './endpoints/admin-users.controller';
import { LocationsController } from './endpoints/locations.controller';
import { UserBankAccountController } from './endpoints/user-bank-account.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserAddress, UserBankAccount, Location]),
    StorageModule,
  ],
  controllers: [
    UsersController,
    AdminUsersController,
    LocationsController,
    UserBankAccountController,
  ],
  providers: [UsersService, UserBankAccountService],
  exports: [UsersService, UserBankAccountService, TypeOrmModule],
})
export class UsersModule {}
