import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSalaryAdvancesAndDimensionFiles1818000000000 implements MigrationInterface {
  name = 'AddSalaryAdvancesAndDimensionFiles1818000000000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "opening_salary_debt" numeric(14,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "dimension_file_url" varchar(1000)`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "dimension_file_name" varchar(255)`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "staff_payroll_adjustments" ("id" bigserial PRIMARY KEY, "staff_member_id" bigint NOT NULL REFERENCES "staff_members"("id") ON DELETE CASCADE, "payroll_month" varchar(7) NOT NULL, "reward_amount" numeric(14,2) NOT NULL DEFAULT 0, "note" varchar(1000), "updated_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "UQ_staff_payroll_adjustment_month" UNIQUE ("staff_member_id", "payroll_month"))`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "salary_advances" ("id" bigserial PRIMARY KEY, "staff_member_id" bigint NOT NULL REFERENCES "staff_members"("id") ON DELETE RESTRICT, "advance_date" date NOT NULL, "amount" numeric(14,2) NOT NULL, "fund_id" bigint NOT NULL REFERENCES "cash_funds"("id") ON DELETE RESTRICT, "hub_id" bigint REFERENCES "hubs"("id") ON DELETE SET NULL, "note" varchar(1000), "cash_journal_entry_id" bigint NOT NULL REFERENCES "cash_journal_entries"("id") ON DELETE RESTRICT, "created_by" bigint REFERENCES "users"("id") ON DELETE SET NULL, "created_at" timestamp NOT NULL DEFAULT now())`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_salary_advances_staff_date" ON "salary_advances" ("staff_member_id", "advance_date")`);
    await queryRunner.query(`INSERT INTO "expense_categories" ("name", "description", "is_active", "sort_order") SELECT '334-Phải trả người lao động', 'Các khoản chi lương, tạm ứng lương', true, 5 WHERE NOT EXISTS (SELECT 1 FROM "expense_categories" WHERE LOWER("name") = LOWER('334-Phải trả người lao động'))`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "salary_advances"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_payroll_adjustments"`);
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "dimension_file_name"`);
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "dimension_file_url"`);
    await queryRunner.query(`ALTER TABLE "staff_members" DROP COLUMN IF EXISTS "opening_salary_debt"`);
  }
}
