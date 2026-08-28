import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
} from 'typeorm';

@Entity('user_addresses')
export class UserAddress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ default: false })
  isDeleted: boolean;

  @Column()
  userId: string;

  @Column()
  title: string;

  @Column({ default: 'Both' })
  type: string;

  @Column()
  contactName: string;

  @Column()
  contactPhone: string;

  @Column()
  country: string;

  @Column()
  city: string;

  @Column({ nullable: true })
  district: string;

  @Column()
  street: string;

  @Column({ nullable: true })
  buildingNumber: string;

  @Column({ nullable: true })
  postalCode: string;

  @Column({ type: 'float', nullable: true })
  latitude: number;

  @Column({ type: 'float', nullable: true })
  longitude: number;

  @Column({ default: false })
  isDefault: boolean;

  @Column({ nullable: true })
  otoBranchCode: string;
}
