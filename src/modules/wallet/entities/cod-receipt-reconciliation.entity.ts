import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
} from 'typeorm';
import { CodReconciliationStatus } from '../enums/wallet.enum';

export interface CodReconciliationLineItem {
  trackingNumber: string;
  shipmentId?: string;
  otoOrderId?: string;
  merchantId?: string;
  courierCollectedAmount: number;
  expectedCodAmount: number;
  shippingCostDeducted: number;
  netCreditedToWallet: number;
  carrierCode?: string;
  carrierReceiptReference?: string;
  status: 'MATCHED' | 'DISCREPANCY' | 'NOT_FOUND' | 'ALREADY_SETTLED';
  walletTransactionId?: string;
  notes?: string;
}

@Entity('cod_receipt_reconciliations')
export class CodReceiptReconciliation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ default: false })
  isDeleted: boolean;

  @Column({ unique: true })
  batchNumber: string;

  @Column({ default: 'OTO' })
  carrierCode: string;

  @Column({
    type: 'simple-enum',
    enum: CodReconciliationStatus,
    default: CodReconciliationStatus.Completed,
  })
  status: CodReconciliationStatus;

  @Column({ type: 'int', default: 0 })
  totalReceipts: number;

  @Column({ type: 'int', default: 0 })
  matchedReceipts: number;

  @Column({ type: 'int', default: 0 })
  discrepancyReceipts: number;

  @Column({ type: 'int', default: 0 })
  unmatchedReceipts: number;

  @Column({ type: 'float', default: 0 })
  totalCollectedCod: number;

  @Column({ type: 'float', default: 0 })
  totalShippingFeesDeducted: number;

  @Column({ type: 'float', default: 0 })
  totalNetCredited: number;

  @Column({ default: 'SAR' })
  currency: string;

  @Column({ default: 'SYSTEM_AUTO_PIPELINE' })
  reconciledBy: string;

  @Column({ nullable: true })
  notes: string;

  @Column({ type: 'simple-json', nullable: true })
  lineItems: CodReconciliationLineItem[];
}
