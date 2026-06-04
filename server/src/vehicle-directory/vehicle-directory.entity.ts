import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('vehicle_directory')
export class VehicleDirectoryEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar' })
  driver_name: string;

  @Column({ type: 'varchar' })
  region: string;

  @Column({ type: 'varchar' })
  carrier_name: string;

  @Column({ type: 'varchar' })
  license_plate: string;

  @Column({ type: 'varchar' })
  vehicle_type: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
