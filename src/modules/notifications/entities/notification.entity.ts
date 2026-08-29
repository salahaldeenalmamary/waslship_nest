import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
} from 'typeorm';
import { NotificationType } from '../enums/notification.enum';

@Entity('notifications')
export class NotificationEntity {
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

  @Column()
  body: string;

  @Column({
    type: 'simple-enum',
    enum: NotificationType,
    default: NotificationType.General,
  })
  type: NotificationType;

  @Column({ type: 'text', nullable: true })
  data: string;

  @Column({ default: false })
  isRead: boolean;

  @Column({ nullable: true })
  readAt: Date;
}
