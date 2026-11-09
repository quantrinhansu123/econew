import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { VendorEntity } from '../vendors/vendor.entity';
import { CashFundEntity } from './cash-fund.entity';

@Entity('payment_requests')
export class PaymentRequestEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 32, unique: true })
  request_code: string;

  @Column({ type: 'date' })
  request_date: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  department_name: string | null;

  @Column({ type: 'bigint', nullable: true })
  hub_id: string | null;

  @Column({ type: 'bigint', nullable: true })
  requester_id: string | null;

  @Column({ type: 'varchar', length: 120 })
  requester_name: string;

  @Column({ type: 'varchar', length: 255 })
  beneficiary_name: string;

  @Column({ type: 'bigint', nullable: true })
  vendor_id: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 1000 })
  content: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  note: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  attachment_urls: string[];

  @Column({ type: 'varchar', length: 32, default: 'PENDING_ACCOUNTANT' })
  status: string;

  @Column({ type: 'bigint', nullable: true })
  fund_id: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cost_category: string | null;

  @Column({ type: 'varchar', length: 64, default: 'Nội bộ' })
  source: string;

  @Column({ type: 'bigint', nullable: true })
  accountant_approved_by: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  accountant_approved_name: string | null;

  @Column({ type: 'timestamp', nullable: true })
  accountant_approved_at: Date | null;

  @Column({ type: 'bigint', nullable: true })
  director_approved_by: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  director_approved_name: string | null;

  @Column({ type: 'timestamp', nullable: true })
  director_approved_at: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  rejected_by_name: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  rejected_reason: string | null;

  @Column({ type: 'bigint', nullable: true })
  cash_journal_entry_id: string | null;

  @ManyToOne(() => HubEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'hub_id' })
  hub: HubEntity | null;

  @ManyToOne(() => VendorEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vendor_id' })
  vendor: VendorEntity | null;

  @ManyToOne(() => CashFundEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'fund_id' })
  fund: CashFundEntity | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}

