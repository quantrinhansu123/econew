import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmploymentDatesAndSalaryPayments1823000000000 implements MigrationInterface {
  name = 'AddEmploymentDatesAndSalaryPayments1823000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "termination_date" date`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "staff_salary_payments" (
        "id" bigserial PRIMARY KEY,
        "staff_member_id" bigint NOT NULL REFERENCES "staff_members"("id") ON DELETE RESTRICT,
        "payroll_month" varchar(7) NOT NULL,
        "payment_date" date NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "fund_id" bigint NOT NULL REFERENCES "cash_funds"("id") ON DELETE RESTRICT,
        "hub_id" bigint REFERENCES "hubs"("id") ON DELETE SET NULL,
        "cash_journal_entry_id" bigint NOT NULL REFERENCES "cash_journal_entries"("id") ON DELETE RESTRICT,
        "created_by" bigint REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_staff_salary_payment_month" ON "staff_salary_payments" ("staff_member_id", "payroll_month")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_salary_payments"`);
    await queryRunner.query(`ALTER TABLE "staff_members" DROP COLUMN IF EXISTS "termination_date"`);
  }
}
