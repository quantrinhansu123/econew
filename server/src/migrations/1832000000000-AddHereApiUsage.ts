import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHereApiUsage1832000000000 implements MigrationInterface {
  name = 'AddHereApiUsage1832000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS here_api_usage (
      endpoint varchar(16) NOT NULL CHECK (endpoint IN ('directions', 'geocoding')),
      month_start date NOT NULL,
      requests_used integer NOT NULL DEFAULT 0 CHECK (requests_used >= 0),
      minute_used integer NOT NULL DEFAULT 0 CHECK (minute_used >= 0),
      minute_started_at timestamptz NOT NULL DEFAULT now(),
      blocked_until timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (endpoint, month_start)
    )`);
    await queryRunner.query('ALTER TABLE here_api_usage ENABLE ROW LEVEL SECURITY');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS here_api_usage');
  }
}
