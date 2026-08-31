import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
  OneToMany,
} from 'typeorm';
import { BankTransferPayment } from './bank-transfer-payment.entity';

@Entity('bank_accounts')
export class BankAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ default: false })
  isDeleted: boolean;

  @Column()
  bankName: string;

  @Column()
  accountHolderName: string;

  @Column()
  accountNumber: string;

  @Column({ nullable: true })
  iban: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => BankTransferPayment, (payment) => payment.bankAccount)
  payments: BankTransferPayment[];
}
