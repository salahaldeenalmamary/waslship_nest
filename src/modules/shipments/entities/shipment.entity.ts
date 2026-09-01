import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PaymentMethod, ShipmentStatus } from '../enums/shipment.enum';
import { UserAddress } from '../../users/entities/user-address.entity';

@Entity('shipments')
export class Shipment {
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

  @Column({ unique: true })
  trackingNumber: string;

  @Column({ nullable: true })
  otoOrderId: string;

  @Column({ type: 'float', nullable: true })
  otoDeliveryFee: number;

  @Column({
    type: 'simple-enum',
    enum: ShipmentStatus,
    default: ShipmentStatus.Created,
  })
  status: ShipmentStatus;

  @Column({
    type: 'simple-enum',
    enum: PaymentMethod,
    default: PaymentMethod.COD,
  })
  paymentMethod: PaymentMethod;

  @Column({ type: 'float', default: 0 })
  codAmount: number;

  @Column({ type: 'float', default: 0 })
  shippingCost: number;

  @Column({ default: 'SAR' })
  currency: string;

  // Addresses referenced from UserAddress table
  @Column({ nullable: true })
  pickupAddressId: string;

  @ManyToOne(() => UserAddress, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'pickupAddressId' })
  pickupAddress: UserAddress;

  @Column({ nullable: true })
  deliveryAddressId: string;

  @ManyToOne(() => UserAddress, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'deliveryAddressId' })
  deliveryAddress: UserAddress;

  // Package specs
  @Column({ type: 'float', default: 1 })
  weightKg: number;

  @Column({ default: 1 })
  piecesCount: number;

  @Column({ nullable: true })
  packageDescription: string;

  @Column({ nullable: true })
  carrierName: string;

  @Column({ nullable: true })
  carrierTrackingUrl: string;

  @Column({ nullable: true })
  notes: string;

  @Column({ default: false })
  isCodSettled: boolean;

  @Column({ nullable: true })
  deliveredAt: Date;

  // Admin audit tracking fields
  @Column({ nullable: true })
  createdByAdminId: string;

  @Column({ nullable: true })
  createdByAdminName: string;

  @Column({ nullable: true })
  lastModifiedByAdminId: string;

  @Column({ nullable: true })
  lastModifiedByAdminName: string;
}
