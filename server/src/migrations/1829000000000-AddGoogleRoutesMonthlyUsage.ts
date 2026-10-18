import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleRoutesMonthlyUsage1829000000000 implements MigrationInterface {
  name = 'AddGoogleRoutesMonthlyUsage1829000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS google_routes_monthly_usage (
        billing_month varchar(7) PRIMARY KEY CHECK (billing_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
        requests_used integer NOT NULL DEFAULT 0 CHECK (requests_used BETWEEN 0 AND 10000),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Only the server's database connection may read or change the budget.
    await queryRunner.query('ALTER TABLE google_routes_monthly_usage ENABLE ROW LEVEL SECURITY');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS google_routes_monthly_usage');
  }
}
