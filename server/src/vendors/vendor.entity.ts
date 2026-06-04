import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { TruckEntity } from '../trucks/truck.entity';
import { VendorDebtEntryEntity } from './vendor-debt-entry.entity';
import { VendorPaymentEntity } from './vendor-payment.entity';

@Entity('vendors')
export class VendorEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', nullable: true, unique: true })
  code: string | null;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @Column({ type: 'varchar', nullable: true })
  service_type: string | null;

  @Column({ type: 'varchar', nullable: true })
  contact_name: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  province: string | null;

  @Column({ type: 'varchar', nullable: true })
  contract_type: string | null;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: string;

  @Column({ type: 'decimal', default: 0 })
  payable_balance: string;

  @Column({ type: 'jsonb', nullable: true })
  routes: Record<string, unknown> | unknown[] | null;

  @Column({ type: 'jsonb', nullable: true })
  pricing: Record<string, unknown> | unknown[] | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @OneToMany(() => TruckEntity, (truck) => truck.vendor)
  trucks: TruckEntity[];

  @OneToMany(() => VendorDebtEntryEntity, (entry) => entry.vendor)
  debt_entries: VendorDebtEntryEntity[];

  @OneToMany(() => VendorPaymentEntity, (payment) => payment.vendor)
  payments: VendorPaymentEntity[];
}
