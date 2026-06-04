import { Column, CreateDateColumn, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TripEntity } from '../trips/trip.entity';
import { UserEntity } from '../users/user.entity';
import { VendorEntity } from './vendor.entity';

@Entity('vendor_payments')
export class VendorPaymentEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'bigint' })
  vendor_id: string;

  @Column({ type: 'decimal' })
  amount: string;

  @Column({ type: 'timestamp' })
  payment_date: Date;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'bigint', nullable: true })
  created_by: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @ManyToOne(() => VendorEntity, (vendor) => vendor.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vendor_id' })
  vendor: VendorEntity;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: UserEntity | null;

  @ManyToMany(() => TripEntity)
  @JoinTable({
    name: 'vendor_payment_trips',
    joinColumn: { name: 'payment_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'trip_id', referencedColumnName: 'id' },
  })
  trips: TripEntity[];
}
