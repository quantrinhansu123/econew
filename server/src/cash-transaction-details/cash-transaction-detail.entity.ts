import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, JoinColumn, ManyToOne } from 'typeorm';
import { VehicleCostEntity } from '../vehicle-costs/vehicle-cost.entity';

@Entity('cash_transaction_details')
export class CashTransactionDetailEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'bigint' })
  vehicle_cost_id: string;

  @Column({ type: 'varchar' })
  voucher_type: string;

  @Column({ type: 'varchar' })
  voucher_name: string;

  @Column({ type: 'varchar' })
  service_type: string;

  @Column({ type: 'varchar' })
  counterparty_unit: string;

  @Column({ type: 'varchar' })
  content: string;

  @Column({ type: 'varchar' })
  performed_by: string;

  @Column({ type: 'date' })
  entry_date: string;

  @Column({ type: 'time' })
  entry_time: string;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  amount: string;

  @ManyToOne(() => VehicleCostEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_cost_id' })
  vehicle_cost: VehicleCostEntity;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
