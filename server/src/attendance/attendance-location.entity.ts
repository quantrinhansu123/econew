import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { AttendanceLogEntity } from './attendance-log.entity';
import { AttendanceVerificationMethod } from './attendance.enums';

@Entity('attendance_locations')
export class AttendanceLocationEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string | null;

  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;

  @Column({ type: 'varchar', length: 16, default: AttendanceVerificationMethod.GPS })
  verification_method: AttendanceVerificationMethod;

  @Column({ type: 'text', array: true, default: () => "'{}'::text[]" })
  allowed_ips: string[];

  @Column({ type: 'integer', default: 100 })
  radius_meters: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'bigint', nullable: true })
  created_by: string | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: UserEntity | null;

  @OneToMany(() => AttendanceLogEntity, (log) => log.location)
  logs: AttendanceLogEntity[];

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
