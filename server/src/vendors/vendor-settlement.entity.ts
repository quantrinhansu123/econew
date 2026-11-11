import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { TripEntity } from '../trips/trip.entity';
import { VendorEntity } from './vendor.entity';

@Entity('vendor_settlements')
export class VendorSettlementEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'bigint' })
  vendor_id: string;

  @Column({ type: 'date' })
  from_date: string;

  @Column({ type: 'date' })
  to_date: string;

  @Column({ type: 'bigint' })
  created_by: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @ManyToOne(() => VendorEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vendor_id' })
  vendor: VendorEntity;

  @OneToMany(() => VendorSettlementItemEntity, (item) => item.settlement)
  items: VendorSettlementItemEntity[];
}

@Entity('vendor_settlement_items')
@Unique('UQ_vendor_settlement_trip', ['trip_id'])
export class VendorSettlementItemEntity {
  @PrimaryColumn({ type: 'bigint' })
  settlement_id: string;

  @PrimaryColumn({ type: 'bigint' })
  trip_id: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  amount: string;

  @ManyToOne(() => VendorSettlementEntity, (settlement) => settlement.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'settlement_id' })
  settlement: VendorSettlementEntity;

  @ManyToOne(() => TripEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'trip_id', foreignKeyConstraintName: 'FK_vendor_settlement_trip' })
  trip: TripEntity;
}
