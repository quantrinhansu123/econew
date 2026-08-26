import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { UserEntity } from '../users/user.entity';
import { StaffDepartmentEntity } from './staff-department.entity';

@Entity('staff_members')
export class StaffMemberEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 32 })
  employee_code: string;

  @Column({ type: 'varchar' })
  full_name: string;

  @Column({ type: 'bigint', nullable: true })
  department_id: string | null;

  @ManyToOne(() => StaffDepartmentEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department_record: StaffDepartmentEntity | null;

  @Column({ type: 'varchar', length: 120 })
  department: string;

  @Column({ type: 'varchar', length: 120 })
  position: string;

  @Column({ type: 'varchar', length: 32 })
  phone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  identity_number: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string | null;

  @Column({ type: 'date', nullable: true })
  hire_date: string | null;

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  employment_status: string;

  @Column({ type: 'bigint', nullable: true })
  hub_id: string | null;

  @ManyToOne(() => HubEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'hub_id' })
  hub: HubEntity | null;

  @Column({ type: 'bigint', nullable: true })
  user_id: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  base_salary: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  meal_allowance: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  transport_allowance: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  other_allowance: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  overtime_hourly_rate: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 26 })
  standard_work_days: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  opening_salary_debt: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  note: string | null;

  @Column({ type: 'varchar', nullable: true })
  password_hash: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
