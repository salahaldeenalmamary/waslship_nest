import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
} from 'typeorm';
import { TransactionStatus, TransactionType } from '../enums/wallet.enum';

@Entity('wallet_transactions')
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ default: false })
  isDeleted: boolean;

  @Column()
  walletId: string;

  @Column()
  merchantId: string;

  @Column({ type: 'float' })
  amount: number;

  @Column({
    type: 'simple-enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({
    type: 'simple-enum',
    enum: TransactionStatus,
    default: TransactionStatus.Completed,
  })
  status: TransactionStatus;

  @Column({ nullable: true })
  referenceId: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: 'SAR' })
  currency: string;
}
