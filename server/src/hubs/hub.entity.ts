import { Column, CreateDateColumn, DeleteDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { HubType } from './dto/create-hub.dto';
import { UserHubEntity } from '../users/user-hub.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
import { ManifestEntity } from '../manifests/manifest.entity';
import { TripEntity } from '../trips/trip.entity';
import { ReconciliationEntity } from '../reconciliations/reconciliation.entity';

@Entity('hubs')
export class HubEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', unique: true })
  code: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'enum', enum: HubType, default: HubType.HUB })
  type: HubType;

  @Column({ type: 'varchar' })
  province: string;

  @Column({ type: 'varchar' })
  district: string;

  @Column({ type: 'varchar', nullable: true })
  ward: string | null;

  @Column({ type: 'varchar' })
  address: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  manager_name: string | null;

  @Column({ type: 'varchar', nullable: true })
  manager_phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  coordinates: string | null;

  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;

  @Column({ type: 'int', default: 0 })
  transit_days: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deleted_at: Date | null;

  @OneToMany(() => UserHubEntity, (userHub) => userHub.hub)
  user_hubs: UserHubEntity[];

  @OneToMany(() => WaybillEntity, (waybill) => waybill.origin_hub)
  origin_waybills: WaybillEntity[];

  @OneToMany(() => WaybillEntity, (waybill) => waybill.dest_hub)
  dest_waybills: WaybillEntity[];

  @OneToMany(() => ManifestEntity, (manifest) => manifest.origin_hub)
  origin_manifests: ManifestEntity[];

  @OneToMany(() => ManifestEntity, (manifest) => manifest.dest_hub)
  dest_manifests: ManifestEntity[];

  @OneToMany(() => TripEntity, (trip) => trip.start_hub)
  starting_trips: TripEntity[];

  @OneToMany(() => TripEntity, (trip) => trip.end_hub)
  ending_trips: TripEntity[];

  @OneToMany(() => ReconciliationEntity, (reconciliation) => reconciliation.hub)
  reconciliations: ReconciliationEntity[];
}
