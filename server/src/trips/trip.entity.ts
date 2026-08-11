import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { TripStatus, VendorTripPaymentStatus } from '../common/enums';
import { ExpenseEntity } from '../expenses/expense.entity';
import { HubEntity } from '../hubs/hub.entity';
import { ManifestEntity } from '../manifests/manifest.entity';
import { TruckEntity } from '../trucks/truck.entity';
import { VendorEntity } from '../vendors/vendor.entity';

@Entity('trips')
export class TripEntity {
  route_label?: string;
  route_stops?: Array<{
    hub_id: string;
    hub_code: string | null;
    hub_name: string | null;
    expected_arrival_at: Date | null;
  }>;

  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'bigint', nullable: true })
  truck_id: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  manual_license_plate: string | null;

  @Column({ type: 'bigint', nullable: true })
  manifest_id: string | null;

  @Column({ type: 'bigint' })
  start_hub_id: string;

  @Column({ type: 'bigint' })
  end_hub_id: string;

  @Column({ type: 'timestamp' })
  departure_time: Date;

  @Column({ type: 'timestamp', nullable: true })
  arrival_time: Date | null;

  @Column({ type: 'enum', enum: TripStatus, default: TripStatus.PLANNED })
  status: TripStatus;

  @Column({ type: 'double precision', nullable: true })
  fuel_actual: number | null;

  @Column({ type: 'decimal', nullable: true })
  fuel_cost: string | null;

  @Column({ type: 'decimal', nullable: true })
  other_costs: string | null;

  @Column({ type: 'decimal', nullable: true })
  trip_cost: string | null;

  @Column({ type: 'bigint', nullable: true })
  vendor_id: string | null;

  @Column({ type: 'timestamp', nullable: true })
  expected_arrival_time: Date | null;

  @Column({ type: 'double precision', nullable: true })
  actual_total_weight: number | null;

  @Column({ type: 'double precision', nullable: true })
  actual_total_volume: number | null;

  @Column({ type: 'varchar', nullable: true })
  driver_name: string | null;

  @Column({ type: 'varchar', nullable: true })
  driver_phone: string | null;

  @Column({ type: 'enum', enum: VendorTripPaymentStatus, default: VendorTripPaymentStatus.UNPAID })
  vendor_payment_status: VendorTripPaymentStatus;

  @Column({ type: 'decimal', default: 0 })
  vendor_paid_amount: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  vendor_payment_proof_url: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  vendor_payment_note: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @ManyToOne(() => TruckEntity, (truck) => truck.trips, { nullable: true })
  @JoinColumn({ name: 'truck_id' })
  truck: TruckEntity | null;

  @ManyToOne(() => VendorEntity, { nullable: true })
  @JoinColumn({ name: 'vendor_id' })
  vendor: VendorEntity | null;

  @ManyToOne(() => ManifestEntity, (manifest) => manifest.trips, { nullable: true })
  @JoinColumn({ name: 'manifest_id' })
  manifest: ManifestEntity | null;

  @ManyToOne(() => HubEntity, (hub) => hub.starting_trips)
  @JoinColumn({ name: 'start_hub_id' })
  start_hub: HubEntity;

  @ManyToOne(() => HubEntity, (hub) => hub.ending_trips)
  @JoinColumn({ name: 'end_hub_id' })
  end_hub: HubEntity;

  @OneToMany(() => ExpenseEntity, (expense) => expense.trip)
  expenses: ExpenseEntity[];
}
