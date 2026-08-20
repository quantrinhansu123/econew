import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpenseCategoryDirectory1815000000000 implements MigrationInterface {
  name = 'AddExpenseCategoryDirectory1815000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expense_categories" (
        "id" BIGSERIAL PRIMARY KEY,
        "name" varchar(100) NOT NULL,
        "description" varchar(500),
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_by" bigint,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_expense_categories_name" ON "expense_categories" (LOWER("name"))`);
    await queryRunner.query(`
      INSERT INTO "expense_categories" ("name", "sort_order")
      SELECT item.name, item.sort_order
      FROM (VALUES
        ('FUEL', 10),
        ('TOLL', 20),
        ('PARKING', 30),
        ('LOADING_UNLOADING', 40),
        ('EN_ROUTE_DROP', 50),
        ('WAREHOUSE', 60),
        ('HCM_WAREHOUSE', 70),
        ('REPAIR', 80),
        ('DRIVER_ALLOWANCE', 90),
        ('OTHER', 999)
      ) AS item(name, sort_order)
      ON CONFLICT (LOWER("name")) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "expense_categories" ("name", "sort_order")
      SELECT DISTINCT TRIM(value), 500
      FROM (
        SELECT category AS value FROM expenses WHERE category IS NOT NULL
        UNION ALL
        SELECT cost_category AS value FROM cash_journal_entries WHERE voucher_type = 'Chi' AND cost_category IS NOT NULL
        UNION ALL
        SELECT cost_category AS value FROM vendor_payments WHERE cost_category IS NOT NULL
      ) existing
      WHERE NULLIF(TRIM(value), '') IS NOT NULL
      ON CONFLICT (LOWER("name")) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "expense_categories"`);
  }
}
