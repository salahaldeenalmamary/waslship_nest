import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BankTransferStatus } from '../enums/wallet.enum';
import { BankAccount } from './bank-account.entity';

@Entity('bank_transfer_payments')
export class BankTransferPayment {
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
  bankAccountId: string;

  @ManyToOne(() => BankAccount, (bankAccount) => bankAccount.payments, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'bankAccountId' })
  bankAccount: BankAccount;

  @Column({ nullable: true })
  receiptUrl: string;

  @Column({
    type: 'simple-enum',
    enum: BankTransferStatus,
    default: BankTransferStatus.Pending,
  })
  status: BankTransferStatus;

  @Column({ nullable: true })
  adminNotes: string;

  @Column({ nullable: true })
  reviewedByAdminId: string;
}
