import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserAddress } from './entities/user-address.entity';
import { Location } from './entities/location.entity';
import { StorageModule } from '../storage/storage.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AdminUsersController } from './admin-users.controller';
import { LocationsController } from './locations.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserAddress, Location]),
    StorageModule,
  ],
  controllers: [UsersController, AdminUsersController, LocationsController],
  providers: [UsersService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
