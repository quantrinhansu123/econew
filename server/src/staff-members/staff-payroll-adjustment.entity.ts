import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { StaffMemberEntity } from './staff-member.entity';

export interface SalaryTierItem {
  label: string;
  base_salary: number;
  rate_percent: number;
  work_days: number;
}

@Entity('staff_payroll_adjustments')
@Index('UQ_staff_payroll_adjustment_month', ['staff_member_id', 'payroll_month'], { unique: true })
export class StaffPayrollAdjustmentEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ type: 'bigint' }) staff_member_id: string;
  @Column({ type: 'varchar', length: 7 }) payroll_month: string;
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true }) base_salary_override: string | null;
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true }) allowance_override: string | null;
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true }) standard_days_override: string | null;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 }) probation_days: string;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 80 }) probation_rate: string;
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true }) official_days_override: string | null;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) overtime_hours_override: string | null;
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true }) overtime_pay_override: string | null;
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 }) reward_amount: string;
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 }) insurance_deduction: string;
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true }) advance_override: string | null;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) salary_tiers: SalaryTierItem[];
  @Column({ type: 'varchar', length: 1000, nullable: true }) note: string | null;
  @ManyToOne(() => StaffMemberEntity, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'staff_member_id' }) staff_member: StaffMemberEntity;
  @UpdateDateColumn({ type: 'timestamp' }) updated_at: Date;
}
