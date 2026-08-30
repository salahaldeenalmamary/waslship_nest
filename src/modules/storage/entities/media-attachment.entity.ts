import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
  Index,
} from 'typeorm';

@Entity('media_attachments')
export class MediaAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ default: false })
  isDeleted: boolean;

  // Polymorphic relationship fields
  @Index()
  @Column({ nullable: true })
  entityType?: string; // e.g. 'Shipment', 'User', 'BankTransferPayment', 'Store'

  @Index()
  @Column({ nullable: true })
  entityId?: string; // UUID or string identifier of the related entity

  @Index()
  @Column({ nullable: true })
  tag?: string; // e.g. 'receipt', 'avatar', 'proof_of_delivery', 'label', 'cr_document'

  @Column()
  fileName: string;

  @Column()
  originalName: string;

  @Column()
  mimeType: string;

  @Column({ type: 'int' })
  size: number;

  @Column()
  url: string;

  @Column({ nullable: true })
  filePath?: string;

  @Index()
  @Column({ nullable: true })
  uploadedById?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, any>;
}
