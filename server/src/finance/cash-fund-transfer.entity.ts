import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CashFundEntity } from './cash-fund.entity';

@Entity('cash_fund_transfers')
export class CashFundTransferEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'bigint' })
  from_fund_id: string;

  @Column({ type: 'bigint' })
  to_fund_id: string;

  @Column({ type: 'date' })
  transfer_date: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @Column({ type: 'bigint', nullable: true })
  created_by: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  created_by_name: string | null;

  @ManyToOne(() => CashFundEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'from_fund_id' })
  from_fund: CashFundEntity;

  @ManyToOne(() => CashFundEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'to_fund_id' })
  to_fund: CashFundEntity;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}

