import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { UserEntity } from '../users/user.entity';
import { WaybillEntity } from '../waybills/waybill.entity';

@Entity('orders')
export class OrderEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  order_code: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  ma_kh: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sender_name: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  sender_phone: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  sender_address: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  receiver_name: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  receiver_company_name: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  receiver_phone: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  receiver_address: string | null;

  @Column({ type: 'bigint' })
  origin_hub_id: string;

  @Column({ type: 'bigint' })
  dest_hub_id: string;

  @Column({ type: 'int', default: 1 })
  package_count: number;

  @Column({ type: 'double precision', default: 0 })
  weight: number;

  @Column({ type: 'varchar', length: 16, default: 'PP' })
  payment_type: string;

  @Column({ type: 'decimal', default: 0 })
  freight_amount: string;

  @Column({ type: 'decimal', default: 0 })
  cod_amount: string;

  @Column({ type: 'decimal', default: 0 })
  cc_amount: string;

  @Column({ type: 'varchar', length: 32, default: 'CONFIRMED' })
  status: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'bigint', nullable: true })
  created_by: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true })
  updated_at: Date | null;

  @ManyToOne(() => HubEntity)
  @JoinColumn({ name: 'origin_hub_id' })
  origin_hub: HubEntity;

  @ManyToOne(() => HubEntity)
  @JoinColumn({ name: 'dest_hub_id' })
  dest_hub: HubEntity;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: UserEntity | null;

  @OneToMany(() => WaybillEntity, (waybill) => waybill.order)
  waybills: WaybillEntity[];
}
