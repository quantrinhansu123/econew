import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { TripEntity } from '../trips/trip.entity';
import { VendorPaymentEntity } from './vendor-payment.entity';

/**
 * The amount of a vendor payment assigned to an individual trip.
 *
 * vendor_payment_trips is kept for backwards compatibility with the first
 * payment implementation, but it cannot represent a partial allocation.
 * This table is the source of truth for all payments created after the
 * ledger migration.
 */
@Entity('vendor_payment_allocations')
export class VendorPaymentAllocationEntity {
  @PrimaryColumn({ type: 'bigint' })
  payment_id: string;

  @PrimaryColumn({ type: 'bigint' })
  trip_id: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  amount: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @ManyToOne(() => VendorPaymentEntity, (payment) => payment.allocations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payment_id' })
  payment: VendorPaymentEntity;

  @ManyToOne(() => TripEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: TripEntity;
}
