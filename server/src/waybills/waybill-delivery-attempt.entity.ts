import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { WaybillEntity } from './waybill.entity';

@Entity('waybill_delivery_attempts')
@Index('IDX_waybill_delivery_attempts_waybill_number', ['waybill_id', 'attempt_number'])
export class WaybillDeliveryAttemptEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'bigint' })
  waybill_id: string;

  @Column({ type: 'int' })
  attempt_number: number;

  @Column({ type: 'varchar', length: 32 })
  status: 'IN_PROGRESS' | 'DELIVERED' | 'RETURNED';

  @Column({ type: 'bigint', nullable: true })
  driver_id: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  delivery_vehicle: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  delivery_address: string | null;

  @Column({ type: 'text', nullable: true })
  delivery_photo_url: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  return_reason: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  return_action: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  redelivery_address: string | null;

  @Column({ type: 'timestamp' })
  started_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'bigint', nullable: true })
  created_by: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @ManyToOne(() => WaybillEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'waybill_id' })
  waybill: WaybillEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'driver_id' })
  driver: UserEntity | null;
}
