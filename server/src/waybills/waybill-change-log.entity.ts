import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { WaybillEntity } from './waybill.entity';

export interface WaybillFieldChange {
  old_value: unknown;
  new_value: unknown;
}

@Entity('waybill_change_logs')
@Index('IDX_waybill_change_logs_waybill_created', ['waybill_id', 'created_at'])
export class WaybillChangeLogEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'bigint' })
  waybill_id: string;

  @Column({ type: 'varchar', length: 32 })
  action: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  changes: Record<string, WaybillFieldChange>;

  @Column({ type: 'bigint', nullable: true })
  changed_by_id: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  changed_by_name: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @ManyToOne(() => WaybillEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'waybill_id' })
  waybill: WaybillEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'changed_by_id' })
  changed_by: UserEntity | null;
}
