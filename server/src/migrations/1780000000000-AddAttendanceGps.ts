import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttendanceGps1780000000000 implements MigrationInterface {
  name = 'AddAttendanceGps1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE attendance_locations (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address VARCHAR(500),
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        radius_meters INTEGER NOT NULL DEFAULT 100,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_attendance_locations_active ON attendance_locations(is_active)`);

    await queryRunner.query(`
      CREATE TABLE attendance_logs (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        location_id BIGINT REFERENCES attendance_locations(id) ON DELETE SET NULL,
        type VARCHAR(16) NOT NULL CHECK (type IN ('check_in', 'check_out')),
        user_latitude DOUBLE PRECISION NOT NULL,
        user_longitude DOUBLE PRECISION NOT NULL,
        accuracy DOUBLE PRECISION,
        distance_meters DOUBLE PRECISION,
        status VARCHAR(16) NOT NULL CHECK (status IN ('success', 'failed')),
        work_date DATE NOT NULL DEFAULT CURRENT_DATE,
        accuracy_warning BOOLEAN NOT NULL DEFAULT false,
        failure_reason VARCHAR(500),
        device_info VARCHAR(1000),
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_attendance_logs_user_created ON attendance_logs(user_id, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_attendance_logs_location_created ON attendance_logs(location_id, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_attendance_logs_status_created ON attendance_logs(status, created_at DESC)`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_attendance_success_once_per_day
      ON attendance_logs (user_id, type, work_date)
      WHERE status = 'success'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_attendance_success_once_per_day`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_attendance_logs_status_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_attendance_logs_location_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_attendance_logs_user_created`);
    await queryRunner.query(`DROP TABLE IF EXISTS attendance_logs`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_attendance_locations_active`);
    await queryRunner.query(`DROP TABLE IF EXISTS attendance_locations`);
  }
}
