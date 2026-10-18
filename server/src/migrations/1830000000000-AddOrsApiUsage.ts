import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrsApiUsage1830000000000 implements MigrationInterface {
  name = 'AddOrsApiUsage1830000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS ors_api_usage (
      key_hash varchar(64) NOT NULL,
      endpoint varchar(16) NOT NULL CHECK (endpoint IN ('directions', 'geocoding')),
      requests_used integer NOT NULL DEFAULT 0 CHECK (requests_used >= 0),
      daily_limit integer NOT NULL CHECK (daily_limit > 0),
      resets_at timestamptz NOT NULL,
      minute_used integer NOT NULL DEFAULT 0 CHECK (minute_used >= 0),
      minute_started_at timestamptz NOT NULL DEFAULT now(),
      blocked_until timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (key_hash, endpoint)
    )`);
    await queryRunner.query('ALTER TABLE ors_api_usage ENABLE ROW LEVEL SECURITY');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS ors_api_usage');
  }
}
