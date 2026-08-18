import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { HubEntity } from '../hubs/hub.entity';

@Entity('cash_funds')
@Index('UQ_cash_funds_code', ['code'], { unique: true })
export class CashFundEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'bigint', nullable: true })
  hub_id: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @Column({ type: 'bigint', nullable: true })
  created_by: string | null;

  @ManyToOne(() => HubEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'hub_id' })
  hub: HubEntity | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
