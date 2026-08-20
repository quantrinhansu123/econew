import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { StaffMemberEntity } from './staff-member.entity';

@Entity('staff_attendance_records')
export class StaffAttendanceEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'bigint' })
  staff_member_id: string;

  @ManyToOne(() => StaffMemberEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staff_member_id' })
  staff_member: StaffMemberEntity;

  @Column({ type: 'date' })
  work_date: string;

  @Column({ type: 'decimal', precision: 4, scale: 2, default: 0 })
  work_days: string;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
  overtime_hours: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @Column({ type: 'bigint', nullable: true })
  created_by: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator: UserEntity | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
