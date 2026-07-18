import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CustomerPaymentStatus, PaymentType, WaybillState } from '../common/enums';
import { HubEntity } from '../hubs/hub.entity';
import { ManifestWaybillEntity } from '../manifests/manifest-waybill.entity';
import { OrderEntity } from '../orders/order.entity';
import { UserEntity } from '../users/user.entity';

@Entity('waybills')
@Index('UQ_waybills_waybill_code_active', ['waybill_code'], { unique: true, where: '"deleted_at" IS NULL' })
export class WaybillEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar' })
  waybill_code: string;

  @Column({ type: 'varchar' })
  sender_info: string;

  @Column({ type: 'varchar' })
  receiver_info: string;

  @Column({ type: 'varchar', nullable: true })
  receiver_phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  sender_phone: string | null;

  @Column({ type: 'timestamp', nullable: true })
  loaded_at: Date | null;

  @Column({ type: 'double precision' })
  weight: number;

  @Column({ type: 'double precision' })
  length: number;

  @Column({ type: 'double precision' })
  width: number;

  @Column({ type: 'double precision' })
  height: number;

  @Column({ type: 'double precision' })
  volumetric_weight: number;

  @Column({ type: 'enum', enum: PaymentType })
  payment_type: PaymentType;

  @Column({ type: 'decimal' })
  cost_amount: string;

  @Column({ type: 'decimal', nullable: true })
  freight_amount: string | null;

  @Column({ type: 'varchar', nullable: true })
  ma_kh: string | null;

  @Column({ type: 'varchar', nullable: true })
  noi_den: string | null;

  @Column({ type: 'varchar', nullable: true })
  receiver_address: string | null;

  @Column({ type: 'double precision', nullable: true })
  the_tich_m3: number | null;

  @Column({ type: 'enum', enum: WaybillState, default: WaybillState.RECEIVED })
  current_state: WaybillState;

  @Column({ type: 'bigint' })
  origin_hub_id: string;

  @Column({ type: 'bigint' })
  dest_hub_id: string;

  @Column({ type: 'bigint', nullable: true })
  current_hub_id: string | null;

  @Column({ type: 'bigint', nullable: true })
  order_id: string | null;

  @Column({ type: 'bigint', nullable: true })
  last_mile_driver_id: string | null;

  @Column({ type: 'text', nullable: true })
  delivery_photo_url: string | null;

  @Column({ type: 'timestamp', nullable: true })
  delivery_time: Date | null;

  @Column({ type: 'varchar', default: 'NORMAL' })
  priority: string;

  @Column({ type: 'varchar', nullable: true })
  priority_reason: string | null;

  @Column({ type: 'varchar', nullable: true })
  route_code: string | null;

  @Column({ type: 'decimal', default: 0 })
  cod_amount: string;

  @Column({ type: 'int', default: 1 })
  package_count: number;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @Column({ type: 'enum', enum: CustomerPaymentStatus, nullable: true })
  customer_payment_status: CustomerPaymentStatus | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  customer_payment_note: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  noi_dung: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  xe_lay: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  xe_phat: string | null;

  @Column({ type: 'timestamp', nullable: true })
  received_at: Date | null;

  @Column({ type: 'bigint', nullable: true })
  received_by: string | null;

  @Column({ type: 'timestamp', nullable: true })
  delivered_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  returned_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelled_at: Date | null;

  @Column({ type: 'varchar', nullable: true })
  cancel_reason: string | null;

  @Column({ type: 'varchar', nullable: true })
  last_audit_action: string | null;

  @Column({ type: 'bigint', nullable: true })
  last_audit_user_id: string | null;

  @Column({ type: 'timestamp', nullable: true })
  last_audit_at: Date | null;

  @Column({ type: 'bigint', nullable: true })
  created_by: string | null;

  @Column({ type: 'bigint', nullable: true })
  updated_by: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true })
  updated_at: Date | null;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deleted_at: Date | null;

  @ManyToOne(() => HubEntity, (hub) => hub.origin_waybills)
  @JoinColumn({ name: 'origin_hub_id' })
  origin_hub: HubEntity;

  @ManyToOne(() => HubEntity, (hub) => hub.dest_waybills)
  @JoinColumn({ name: 'dest_hub_id' })
  dest_hub: HubEntity;

  @ManyToOne(() => OrderEntity, (order) => order.waybills, { nullable: true })
  @JoinColumn({ name: 'order_id' })
  order: OrderEntity | null;

  @ManyToOne(() => UserEntity, (user) => user.delivery_waybills, { nullable: true })
  @JoinColumn({ name: 'last_mile_driver_id' })
  last_mile_driver: UserEntity | null;

  @OneToMany(() => ManifestWaybillEntity, (manifestWaybill) => manifestWaybill.waybill)
  manifest_waybills: ManifestWaybillEntity[];
}
