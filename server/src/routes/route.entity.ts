import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { HubEntity } from '../hubs/hub.entity';

@Entity('delivery_routes')
export class DeliveryRouteEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'bigint', nullable: true })
  hub_id: string | null;

  @ManyToOne(() => HubEntity, { nullable: true })
  @JoinColumn({ name: 'hub_id' })
  hub: HubEntity | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  province: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  district: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status: string;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
