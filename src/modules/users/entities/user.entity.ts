import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
  OneToMany,
} from 'typeorm';
import { UserAddress } from './user-address.entity';
import { UserBankAccount } from './user-bank-account.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ default: false })
  isDeleted: boolean;

  @Column({ unique: true })
  email: string;

  @Column({ unique: true })
  phoneNumber: string;

  @Column()
  passwordHash: string;

  @Column()
  fullName: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ nullable: true })
  companyName: string;

  @Column({ default: 'Merchant' })
  role: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isPhoneVerified: boolean;

  @Column({ nullable: true })
  otpCode: string;

  @Column({ nullable: true })
  otpExpiryTime: Date;

  @OneToMany(() => UserAddress, (address) => address.user)
  addresses: UserAddress[];

  @OneToMany(() => UserBankAccount, (bankAccount) => bankAccount.user)
  bankAccounts: UserBankAccount[];
}
