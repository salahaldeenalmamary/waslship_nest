import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
} from 'typeorm';
import { DevicePlatform } from '../enums/notification.enum';

@Entity('device_tokens')
export class DeviceToken {
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

  @Column({ unique: true })
  token: string;

  @Column({
    type: 'simple-enum',
    enum: DevicePlatform,
    default: DevicePlatform.Web,
  })
  platform: DevicePlatform;

  @Column({ default: true })
  isActive: boolean;
}
