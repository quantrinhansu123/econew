import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { TripEntity } from '../trips/trip.entity';
import { UserEntity } from '../users/user.entity';

@Entity('expenses')
export class ExpenseEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'bigint' })
  trip_id: string;

  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  @Column({ type: 'decimal', default: 0 })
  amount: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'bigint', nullable: true })
  hub_id: string | null;

  @Column({ type: 'bigint', nullable: true })
  created_by: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @ManyToOne(() => TripEntity, (trip) => trip.expenses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: TripEntity;

  @ManyToOne(() => HubEntity, { nullable: true })
  @JoinColumn({ name: 'hub_id' })
  hub: HubEntity | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: UserEntity | null;
}
