import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { SalaryAdvanceEntity } from './salary-advance.entity';

export interface SalaryAdvanceFieldChange {
  old_value: unknown;
  new_value: unknown;
}

@Entity('salary_advance_change_logs')
@Index('IDX_salary_advance_change_logs_advance_created', ['salary_advance_id', 'created_at'])
export class SalaryAdvanceChangeLogEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'bigint' })
  salary_advance_id: string;

  @Column({ type: 'varchar', length: 32 })
  action: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  changes: Record<string, SalaryAdvanceFieldChange>;

  @Column({ type: 'bigint', nullable: true })
  changed_by_id: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  changed_by_name: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @ManyToOne(() => SalaryAdvanceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'salary_advance_id' })
  salary_advance: SalaryAdvanceEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'changed_by_id' })
  changed_by: UserEntity | null;
}
