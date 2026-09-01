import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Shipment } from './shipment.entity';
import { ShipmentStatus } from '../enums/shipment.enum';

@Entity('shipment_audit_logs')
export class ShipmentAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  @Index()
  createdAt: Date;

  @Column()
  @Index()
  shipmentId: string;

  @ManyToOne(() => Shipment, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'shipmentId' })
  shipment?: Shipment;

  @Column({ nullable: true })
  @Index()
  trackingNumber: string;

  @Column()
  action: string;

  @Column({
    type: 'simple-enum',
    enum: ShipmentStatus,
    nullable: true,
  })
  fromStatus: ShipmentStatus | null;

  @Column({
    type: 'simple-enum',
    enum: ShipmentStatus,
    nullable: true,
  })
  toStatus: ShipmentStatus | null;

  @Column({ nullable: true })
  @Index()
  adminId: string | null;

  @Column({ nullable: true })
  adminName: string | null;

  @Column({ nullable: true })
  adminEmail: string | null;

  @Column({ nullable: true })
  adminRole: string | null;

  @Column({ default: 'ADMIN' })
  source: string;

  @Column({ nullable: true })
  ipAddress: string | null;

  @Column({ nullable: true })
  userAgent: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;
}
