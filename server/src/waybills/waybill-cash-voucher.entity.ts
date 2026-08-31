import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { CashFundEntity } from '../finance/cash-fund.entity';
import { WaybillEntity } from './waybill.entity';
import { CustomerEntity } from '../customers/customer.entity';

@Entity('waybill_cash_vouchers')
export class WaybillCashVoucherEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'bigint', nullable: true })
  waybill_id: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  waybill_code: string | null;

  @Column({ type: 'bigint', nullable: true })
  customer_id: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  customer_code: string | null;

  @Column({ type: 'varchar', length: 8 })
  voucher_type: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  amount: string;

  @Column({ type: 'varchar', length: 32, default: 'MANUAL' })
  source_type: 'MANUAL' | 'COD_COLLECTION' | 'CUSTOMER_PAYOUT' | 'OPENING_DEBT';

  @Column({ type: 'bigint', nullable: true })
  fund_id: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  note: string | null;

  @Column({ type: 'text', nullable: true })
  image_url: string | null;

  @Column({ type: 'bigint', nullable: true })
  created_by_id: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  created_by_name: string | null;

  @ManyToOne(() => WaybillEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'waybill_id' })
  waybill: WaybillEntity | null;

  @ManyToOne(() => CustomerEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer: CustomerEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  created_by: UserEntity | null;

  @ManyToOne(() => CashFundEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'fund_id' })
  fund: CashFundEntity | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
