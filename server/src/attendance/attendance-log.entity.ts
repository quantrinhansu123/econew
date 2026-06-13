import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { AttendanceCheckType, AttendanceLogStatus } from './attendance.enums';
import { AttendanceLocationEntity } from './attendance-location.entity';

@Entity('attendance_logs')
export class AttendanceLogEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'bigint' })
  user_id: string;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ type: 'bigint', nullable: true })
  location_id: string | null;

  @ManyToOne(() => AttendanceLocationEntity, (location) => location.logs, { nullable: true })
  @JoinColumn({ name: 'location_id' })
  location: AttendanceLocationEntity | null;

  @Column({ type: 'varchar', length: 16 })
  type: AttendanceCheckType;

  @Column({ type: 'double precision' })
  user_latitude: number;

  @Column({ type: 'double precision' })
  user_longitude: number;

  @Column({ type: 'double precision', nullable: true })
  accuracy: number | null;

  @Column({ type: 'double precision', nullable: true })
  distance_meters: number | null;

  @Column({ type: 'date' })
  work_date: string;

  @Column({ type: 'varchar', length: 16 })
  status: AttendanceLogStatus;

  @Column({ type: 'boolean', default: false })
  accuracy_warning: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  failure_reason: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  device_info: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
