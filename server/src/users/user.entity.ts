import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { TruckEntity } from '../trucks/truck.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
import { UserHubEntity } from './user-hub.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar', unique: true })
  username: string;

  @Column({ type: 'varchar' })
  full_name: string;

  @Column({ type: 'varchar' })
  phone: string;

  @Column({ type: 'varchar' })
  password_hash: string;

  @Column({ type: 'integer' })
  role_mask: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  monthly_salary: string;

  @Column({ type: 'bigint', nullable: true })
  hub_id: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'varchar', nullable: true })
  refresh_token: string | null;

  @Column({ type: 'timestamp', nullable: true })
  last_login_at: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @ManyToOne(() => HubEntity, { nullable: true })
  @JoinColumn({ name: 'hub_id' })
  hub: HubEntity | null;

  @OneToMany(() => UserHubEntity, (userHub) => userHub.user)
  user_hubs: UserHubEntity[];

  @OneToMany(() => WaybillEntity, (waybill) => waybill.last_mile_driver)
  delivery_waybills: WaybillEntity[];

  @OneToMany(() => TruckEntity, (truck) => truck.driver)
  trucks: TruckEntity[];
}
