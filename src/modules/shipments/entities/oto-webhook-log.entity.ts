import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
} from 'typeorm';

@Entity('oto_webhook_logs')
export class OtoWebhookLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ default: false })
  isDeleted: boolean;

  @Column()
  eventType: string;

  @Column({ nullable: true })
  otoOrderId: string;

  @Column({ nullable: true })
  trackingNumber: string;

  @Column({ type: 'text' })
  payload: string;

  @Column({ default: true })
  isProcessed: boolean;

  @Column({ nullable: true })
  errorMessage: string;
}
