import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CashFundEntity } from '../finance/cash-fund.entity';
import { UserEntity } from '../users/user.entity';
import { VendorEntity } from '../vendors/vendor.entity';

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

  @Column({ type: 'bigint', nullable: true })
  fund_id: string | null;

  @Column({ type: 'bigint', nullable: true })
  vendor_id: string | null;

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

  @Column({ type: 'bigint', nullable: true })
  created_by_id: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  created_by_name: string | null;

  @ManyToOne(() => CashFundEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'fund_id' })
  fund: CashFundEntity | null;

  @ManyToOne(() => VendorEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vendor_id' })
  vendor: VendorEntity | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  creator: UserEntity | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
