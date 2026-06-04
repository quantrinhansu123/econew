import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { TripEntity } from '../trips/trip.entity';
import { UserEntity } from '../users/user.entity';
import { VendorEntity } from '../vendors/vendor.entity';

@Entity('trucks')
export class TruckEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', unique: true })
  license_plate: string;

  @Column({ type: 'double precision' })
  payload: number;

  @Column({ type: 'bigint', nullable: true })
  driver_id: string | null;

  @Column({ type: 'double precision' })
  fuel_consumption_limit: number;

  @Column({ type: 'varchar' })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  ten_lai_xe: string | null;

  @Column({ type: 'varchar', nullable: true })
  nha_xe: string | null;

  @Column({ type: 'varchar', nullable: true })
  bks: string | null;

  @Column({ type: 'varchar', nullable: true })
  loai_xe: string | null;

  @Column({ type: 'varchar', nullable: true })
  khu_vuc: string | null;

  @Column({ type: 'bigint', nullable: true })
  vendor_id: string | null;

  @ManyToOne(() => VendorEntity, (vendor) => vendor.trucks, { nullable: true })
  @JoinColumn({ name: 'vendor_id' })
  vendor: VendorEntity | null;

  @ManyToOne(() => UserEntity, (user) => user.trucks, { nullable: true })
  @JoinColumn({ name: 'driver_id' })
  driver: UserEntity | null;

  @OneToMany(() => TripEntity, (trip) => trip.truck)
  trips: TripEntity[];
}
