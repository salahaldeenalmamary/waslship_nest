import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
} from 'typeorm';
import { BankTransferStatus } from '../enums/wallet.enum';

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

  @Column()
  bankName: string;

  @Column()
  accountHolderName: string;

  @Column()
  accountNumber: string;

  @Column({ nullable: true })
  iban: string;

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
