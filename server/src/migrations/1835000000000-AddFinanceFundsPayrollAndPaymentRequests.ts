import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFinanceFundsPayrollAndPaymentRequests1835000000000 implements MigrationInterface {
  name = 'AddFinanceFundsPayrollAndPaymentRequests1835000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add opening_balance to cash_funds
    await queryRunner.query(`
      ALTER TABLE "cash_funds"
      ADD COLUMN IF NOT EXISTS "opening_balance" numeric(14,2) NOT NULL DEFAULT 0
    `);

    // 2. Create cash_fund_transfers table (internal fund-to-fund transfers, not counted as expense/income)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cash_fund_transfers" (
        "id" bigserial PRIMARY KEY,
        "from_fund_id" bigint NOT NULL REFERENCES "cash_funds"("id") ON DELETE RESTRICT,
        "to_fund_id" bigint NOT NULL REFERENCES "cash_funds"("id") ON DELETE RESTRICT,
        "transfer_date" date NOT NULL DEFAULT CURRENT_DATE,
        "amount" numeric(14,2) NOT NULL,
        "note" varchar(500),
        "created_by" bigint REFERENCES "users"("id") ON DELETE SET NULL,
        "created_by_name" varchar(120),
        "created_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cash_fund_transfers_from" ON "cash_fund_transfers" ("from_fund_id", "transfer_date")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cash_fund_transfers_to" ON "cash_fund_transfers" ("to_fund_id", "transfer_date")`);

    // 3. Extend staff_payroll_adjustments for monthly salary snapshots, probation (80%), insurance (BHXH), and inline Excel-style editing
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" ADD COLUMN IF NOT EXISTS "base_salary_override" numeric(14,2)`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" ADD COLUMN IF NOT EXISTS "allowance_override" numeric(14,2)`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" ADD COLUMN IF NOT EXISTS "standard_days_override" numeric(5,2)`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" ADD COLUMN IF NOT EXISTS "probation_days" numeric(5,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" ADD COLUMN IF NOT EXISTS "probation_rate" numeric(5,2) NOT NULL DEFAULT 80`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" ADD COLUMN IF NOT EXISTS "official_days_override" numeric(5,2)`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" ADD COLUMN IF NOT EXISTS "overtime_hours_override" numeric(6,2)`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" ADD COLUMN IF NOT EXISTS "overtime_pay_override" numeric(14,2)`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" ADD COLUMN IF NOT EXISTS "insurance_deduction" numeric(14,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" ADD COLUMN IF NOT EXISTS "advance_override" numeric(14,2)`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" ADD COLUMN IF NOT EXISTS "salary_tiers" jsonb NOT NULL DEFAULT '[]'::jsonb`);

    // 4. Create payment_requests table (Đề nghị thanh toán -> Kế toán & Giám đốc duyệt -> Sổ nhật ký chung)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_requests" (
        "id" bigserial PRIMARY KEY,
        "request_code" varchar(32) NOT NULL UNIQUE,
        "request_date" date NOT NULL DEFAULT CURRENT_DATE,
        "department_name" varchar(120),
        "hub_id" bigint REFERENCES "hubs"("id") ON DELETE SET NULL,
        "requester_id" bigint REFERENCES "users"("id") ON DELETE SET NULL,
        "requester_name" varchar(120) NOT NULL,
        "beneficiary_name" varchar(255) NOT NULL,
        "vendor_id" bigint REFERENCES "vendors"("id") ON DELETE SET NULL,
        "amount" numeric(14,2) NOT NULL,
        "content" varchar(1000) NOT NULL,
        "note" varchar(1000),
        "attachment_urls" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "status" varchar(32) NOT NULL DEFAULT 'PENDING_ACCOUNTANT',
        "fund_id" bigint REFERENCES "cash_funds"("id") ON DELETE SET NULL,
        "cost_category" varchar(255),
        "source" varchar(64) NOT NULL DEFAULT 'Nội bộ',
        "accountant_approved_by" bigint REFERENCES "users"("id") ON DELETE SET NULL,
        "accountant_approved_name" varchar(120),
        "accountant_approved_at" timestamp,
        "director_approved_by" bigint REFERENCES "users"("id") ON DELETE SET NULL,
        "director_approved_name" varchar(120),
        "director_approved_at" timestamp,
        "rejected_by_name" varchar(120),
        "rejected_reason" varchar(500),
        "cash_journal_entry_id" bigint REFERENCES "cash_journal_entries"("id") ON DELETE SET NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_payment_requests_status_date" ON "payment_requests" ("status", "request_date" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_payment_requests_hub" ON "payment_requests" ("hub_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_requests"`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" DROP COLUMN IF EXISTS "salary_tiers"`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" DROP COLUMN IF EXISTS "advance_override"`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" DROP COLUMN IF EXISTS "insurance_deduction"`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" DROP COLUMN IF EXISTS "overtime_pay_override"`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" DROP COLUMN IF EXISTS "overtime_hours_override"`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" DROP COLUMN IF EXISTS "official_days_override"`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" DROP COLUMN IF EXISTS "probation_rate"`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" DROP COLUMN IF EXISTS "probation_days"`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" DROP COLUMN IF EXISTS "standard_days_override"`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" DROP COLUMN IF EXISTS "allowance_override"`);
    await queryRunner.query(`ALTER TABLE "staff_payroll_adjustments" DROP COLUMN IF EXISTS "base_salary_override"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cash_fund_transfers"`);
    await queryRunner.query(`ALTER TABLE "cash_funds" DROP COLUMN IF EXISTS "opening_balance"`);
  }
}

