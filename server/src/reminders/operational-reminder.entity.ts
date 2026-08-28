import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { TruckEntity } from '../trucks/truck.entity';
import { UserEntity } from '../users/user.entity';

export type OperationalReminderStatus = 'ACTIVE' | 'COMPLETED';

@Entity('operational_reminders')
@Index('IDX_operational_reminders_active_date', ['status', 'remind_date'])
export class OperationalReminderEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'date' })
  remind_date: string;

  @Column({ type: 'varchar', length: 40, default: 'VEHICLE_DOCUMENT' })
  category: string;

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status: OperationalReminderStatus;

  @Column({ type: 'bigint', nullable: true })
  truck_id: string | null;

  @Column({ type: 'bigint', nullable: true })
  hub_id: string | null;

  @Column({ type: 'bigint' })
  created_by_id: string;

  @Column({ type: 'bigint', nullable: true })
  completed_by_id: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  completed_at: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updated_at: Date;

  @ManyToOne(() => TruckEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'truck_id' })
  truck: TruckEntity | null;

  @ManyToOne(() => HubEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'hub_id' })
  hub: HubEntity | null;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_id' })
  created_by: UserEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'completed_by_id' })
  completed_by: UserEntity | null;
}
