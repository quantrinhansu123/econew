import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { ManifestWaybillEntity } from './manifest-waybill.entity';
import { TripEntity } from '../trips/trip.entity';

@Entity('manifests')
export class ManifestEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', unique: true })
  manifest_code: string;

  @Column({ type: 'varchar' })
  seal_code: string;

  @Column({ type: 'bigint' })
  origin_hub_id: string;

  @Column({ type: 'bigint' })
  dest_hub_id: string;

  @Column({ type: 'varchar' })
  status: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @ManyToOne(() => HubEntity, (hub) => hub.origin_manifests)
  @JoinColumn({ name: 'origin_hub_id' })
  origin_hub: HubEntity;

  @ManyToOne(() => HubEntity, (hub) => hub.dest_manifests)
  @JoinColumn({ name: 'dest_hub_id' })
  dest_hub: HubEntity;

  @OneToMany(() => ManifestWaybillEntity, (manifestWaybill) => manifestWaybill.manifest)
  manifest_waybills: ManifestWaybillEntity[];

  @OneToMany(() => TripEntity, (trip) => trip.manifest)
  trips: TripEntity[];
}
