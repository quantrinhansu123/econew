import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('chanh_shipments')
export class ChanhShipmentEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar' })
  province_code: string;

  @Column({ type: 'integer', default: 0 })
  bill_count: number;

  @Column({ type: 'varchar' })
  company_name: string;

  @Column({ type: 'varchar' })
  goods_name: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  quantity: string;

  @Column({ type: 'varchar' })
  goods_type: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  unit_price: string;

  @Column({ type: 'varchar' })
  cost_type: string;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @Column({ type: 'varchar' })
  carrier_name: string;

  @Column({ type: 'varchar' })
  license_plate: string;

  @Column({ type: 'date' })
  shipment_date: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  bo_fee: string;

  @Column({ type: 'varchar' })
  bill: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
