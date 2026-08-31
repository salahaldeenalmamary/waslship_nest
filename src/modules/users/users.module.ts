import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserAddress } from './entities/user-address.entity';
import { UserBankAccount } from './entities/user-bank-account.entity';
import { Location } from './entities/location.entity';
import { StorageModule } from '../storage/storage.module';
import { UsersService } from './users.service';
import { UserBankAccountService } from './user-bank-account.service';
import { UsersController } from './users.controller';
import { AdminUsersController } from './admin-users.controller';
import { LocationsController } from './locations.controller';
import { UserBankAccountController } from './user-bank-account.controller';

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
