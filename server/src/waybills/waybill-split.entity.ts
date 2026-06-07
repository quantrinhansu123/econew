import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { TripEntity } from '../trips/trip.entity';
import { TruckEntity } from '../trucks/truck.entity';
import { WaybillEntity } from './waybill.entity';
import { WaybillSplitLoadStatus } from './dto/waybill-split-load-status.enum';

@Entity('waybill_splits')
export class WaybillSplitEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'bigint' })
  waybill_id: string;

  @Column({ type: 'bigint', nullable: true })
  trip_id: string | null;

  @Column({ type: 'bigint', nullable: true })
  truck_id: string | null;

  @Column({ type: 'int' })
  package_count: number;

  @Column({ type: 'int', nullable: true })
  loading_position: number | null;

  @Column({ type: 'varchar', nullable: true })
  carrier_label: string | null;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @Column({ type: 'varchar', length: 32, default: WaybillSplitLoadStatus.WAITING_LOAD })
  load_status: WaybillSplitLoadStatus;

  @Column({ type: 'timestamp', nullable: true })
  expected_arrival_at: Date | null;

  @Column({ type: 'bigint', nullable: true })
  created_by: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true })
  updated_at: Date | null;

  @ManyToOne(() => WaybillEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'waybill_id' })
  waybill: WaybillEntity;

  @ManyToOne(() => TripEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'trip_id' })
  trip: TripEntity | null;

  @ManyToOne(() => TruckEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'truck_id' })
  truck: TruckEntity | null;
}
