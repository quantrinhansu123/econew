import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TripEntity } from '../trips/trip.entity';
import { VendorEntity } from './vendor.entity';

@Entity('vendor_debt_entries')
export class VendorDebtEntryEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'bigint' })
  vendor_id: string;

  @Column({ type: 'bigint', nullable: true })
  trip_id: string | null;

  @Column({ type: 'decimal' })
  amount: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @ManyToOne(() => VendorEntity, (vendor) => vendor.debt_entries)
  @JoinColumn({ name: 'vendor_id' })
  vendor: VendorEntity;

  @ManyToOne(() => TripEntity, { nullable: true })
  @JoinColumn({ name: 'trip_id' })
  trip: TripEntity | null;
}
