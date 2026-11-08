import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttendanceNetwork1834000000000 implements MigrationInterface {
  name = 'AddAttendanceNetwork1834000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE attendance_locations
      ADD COLUMN verification_method VARCHAR(16) NOT NULL DEFAULT 'gps',
      ADD COLUMN allowed_ips TEXT[] NOT NULL DEFAULT '{}',
      ALTER COLUMN latitude DROP NOT NULL,
      ALTER COLUMN longitude DROP NOT NULL,
      ADD CONSTRAINT chk_attendance_location_method CHECK (verification_method IN ('gps', 'ip')),
      ADD CONSTRAINT chk_attendance_location_verification CHECK (
        (verification_method = 'gps' AND latitude IS NOT NULL AND longitude IS NOT NULL)
        OR (verification_method = 'ip' AND cardinality(allowed_ips) > 0)
      )`);
    await queryRunner.query(`ALTER TABLE attendance_logs
      ADD COLUMN source_ip VARCHAR(45),
      ADD COLUMN verification_method VARCHAR(16),
      ALTER COLUMN user_latitude DROP NOT NULL,
      ALTER COLUMN user_longitude DROP NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Reverting to a GPS-only app must never discard IP-only attendance records.
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM attendance_locations WHERE verification_method = 'ip')
        OR EXISTS (SELECT 1 FROM attendance_logs WHERE user_latitude IS NULL OR user_longitude IS NULL) THEN
        RAISE EXCEPTION 'Cannot revert network attendance while IP locations or IP-only attendance logs exist';
      END IF;
    END $$`);
    await queryRunner.query(`ALTER TABLE attendance_logs DROP COLUMN verification_method, DROP COLUMN source_ip`);
    await queryRunner.query(`ALTER TABLE attendance_locations
      DROP CONSTRAINT chk_attendance_location_verification,
      DROP CONSTRAINT chk_attendance_location_method,
      DROP COLUMN allowed_ips, DROP COLUMN verification_method,
      ALTER COLUMN latitude SET NOT NULL, ALTER COLUMN longitude SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE attendance_logs ALTER COLUMN user_latitude SET NOT NULL, ALTER COLUMN user_longitude SET NOT NULL`);
  }
}
