import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
} from 'typeorm';

@Entity('locations')
export class Location {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ default: false })
  isDeleted: boolean;

  @Column()
  nameEn: string;

  @Column()
  nameAr: string;

  @Column({ nullable: true })
  code: string;

  @Column({ nullable: true })
  parentCode: string;

  @Column({ default: 'City' })
  type: string;
}
