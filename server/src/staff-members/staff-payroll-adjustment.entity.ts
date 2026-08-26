import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { StaffMemberEntity } from './staff-member.entity';

@Entity('staff_payroll_adjustments')
@Index('UQ_staff_payroll_adjustment_month', ['staff_member_id', 'payroll_month'], { unique: true })
export class StaffPayrollAdjustmentEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ type: 'bigint' }) staff_member_id: string;
  @Column({ type: 'varchar', length: 7 }) payroll_month: string;
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 }) reward_amount: string;
  @Column({ type: 'varchar', length: 1000, nullable: true }) note: string | null;
  @ManyToOne(() => StaffMemberEntity, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'staff_member_id' }) staff_member: StaffMemberEntity;
  @UpdateDateColumn({ type: 'timestamp' }) updated_at: Date;
}
