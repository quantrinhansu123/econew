import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('north_south_shipments')
export class NorthSouthShipmentEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar' })
  bill: string;

  @Column({ type: 'varchar' })
  goods_name: string;

  @Column({ type: 'integer', default: 0 })
  package_count: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  volume: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  weight: string;

  @Column({ type: 'varchar' })
  service_type: string;

  @Column({ type: 'varchar' })
  destination: string;

  @Column({ type: 'varchar' })
  address: string;

  @Column({ type: 'varchar' })
  unit: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  unit_price: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  transfer_fee: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  total_amount: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  cod_amount: string;

  @Column({ type: 'varchar' })
  payment_method: string;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @Column({ type: 'varchar', nullable: true })
  pickup_vehicle_status: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  external_vehicle_cost: string;

  @Column({ type: 'varchar', nullable: true })
  external_vehicle_payment_method: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  customer_discount: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  final_profit: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  carrier_holding_amount: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
