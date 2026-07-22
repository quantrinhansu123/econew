import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('customers')
export class CustomerEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 32, default: 'KHACH_HANG' })
  customer_type: string;

  @Column({ type: 'boolean', default: false })
  is_suspended: boolean;

  @Column({ type: 'varchar', length: 64, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  short_name: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  english_name: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  tax_id: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone_landline: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  id_number: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  mobile: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  bank_name: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  bank_account: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  bank_account_holder: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  manager_name: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  delivery_handler: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contact_person: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  region: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  mechanism: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  portal_password: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  credit_type: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  contract_code: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  price_table: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  contact_address: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  receiver_han: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address_han: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone_han: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  receiver_hcm: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address_hcm: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone_hcm: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  receiver_dng: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address_dng: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone_dng: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  destination_province: string | null;

  @Column({ type: 'double precision', default: 0 })
  discount_percent: number;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deleted_at: Date | null;
}
