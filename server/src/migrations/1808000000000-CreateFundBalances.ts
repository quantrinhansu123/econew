import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFundBalances1808000000000 implements MigrationInterface {
  name = 'CreateFundBalances1808000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fund_balances" (
        "id" BIGSERIAL PRIMARY KEY,
        "record_date" date NOT NULL,
        "fund_code" varchar(64) NOT NULL,
        "fund_name" varchar(255) NOT NULL,
        "hub_name" varchar(255) NULL,
        "balance_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "note" varchar(512) NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_fund_balances_record_date" ON "fund_balances" ("record_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_fund_balances_fund_code" ON "fund_balances" ("fund_code")`,
    );
    await queryRunner.query(
      `COMMENT ON TABLE "fund_balances" IS 'Số quỹ tiền mặt theo mã quỹ / bưu cục'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "fund_balances"`);
  }
}
