import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('cash_journal_entries')
export class CashJournalEntryEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'date' })
  entry_date: string;

  @Column({ type: 'varchar' })
  voucher_type: string;

  @Column({ type: 'varchar' })
  source: string;

  @Column({ type: 'varchar' })
  cost_category: string;

  @Column({ type: 'varchar' })
  detail: string;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @Column({ type: 'varchar' })
  content: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  income_amount: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  expense_amount: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
