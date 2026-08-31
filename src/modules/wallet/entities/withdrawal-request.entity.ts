import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { WithdrawalStatus } from '../enums/wallet.enum';
import { UserBankAccount } from '../../users/entities/user-bank-account.entity';

@Entity('withdrawal_requests')
export class WithdrawalRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ default: false })
  isDeleted: boolean;

  @Column()
  merchantId: string;

  @Column({ type: 'float' })
  amount: number;

  @Column({ nullable: true })
  userBankAccountId: string;

  @ManyToOne(() => UserBankAccount, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'userBankAccountId' })
  userBankAccount: UserBankAccount;

  @Column({
    type: 'simple-enum',
    enum: WithdrawalStatus,
    default: WithdrawalStatus.Pending,
  })
  status: WithdrawalStatus;

  @Column({ nullable: true })
  proofImageUrl: string;

  @Column({ nullable: true })
  adminNotes: string;

  @Column({ nullable: true })
  reviewedByAdminId: string;
}
