import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniversalCashJournal1811000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cash_journal_entries" ADD COLUMN IF NOT EXISTS "fund_id" bigint`);
    await queryRunner.query(`ALTER TABLE "cash_journal_entries" ADD COLUMN IF NOT EXISTS "vendor_id" bigint`);
    await queryRunner.query(`ALTER TABLE "cash_journal_entries" ADD COLUMN IF NOT EXISTS "created_by_id" bigint`);
    await queryRunner.query(`ALTER TABLE "cash_journal_entries" ADD COLUMN IF NOT EXISTS "created_by_name" varchar(255)`);
    await queryRunner.query(`ALTER TABLE "vendor_payments" ADD COLUMN IF NOT EXISTS "fund_id" bigint`);
    await queryRunner.query(`ALTER TABLE "vendor_payments" ADD COLUMN IF NOT EXISTS "cost_category" varchar(255)`);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_cash_journal_fund') THEN
          ALTER TABLE "cash_journal_entries" ADD CONSTRAINT "FK_cash_journal_fund" FOREIGN KEY ("fund_id") REFERENCES "cash_funds"("id") ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_cash_journal_vendor') THEN
          ALTER TABLE "cash_journal_entries" ADD CONSTRAINT "FK_cash_journal_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_cash_journal_creator') THEN
          ALTER TABLE "cash_journal_entries" ADD CONSTRAINT "FK_cash_journal_creator" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_vendor_payments_fund') THEN
          ALTER TABLE "vendor_payments" ADD CONSTRAINT "FK_vendor_payments_fund" FOREIGN KEY ("fund_id") REFERENCES "cash_funds"("id") ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cash_journal_fund_date" ON "cash_journal_entries" ("fund_id", "entry_date" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cash_journal_vendor" ON "cash_journal_entries" ("vendor_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_payments_fund" ON "vendor_payments" ("fund_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_vendor_payments_fund"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cash_journal_vendor"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cash_journal_fund_date"`);
    await queryRunner.query(`ALTER TABLE "vendor_payments" DROP CONSTRAINT IF EXISTS "FK_vendor_payments_fund"`);
    await queryRunner.query(`ALTER TABLE "cash_journal_entries" DROP CONSTRAINT IF EXISTS "FK_cash_journal_creator"`);
    await queryRunner.query(`ALTER TABLE "cash_journal_entries" DROP CONSTRAINT IF EXISTS "FK_cash_journal_vendor"`);
    await queryRunner.query(`ALTER TABLE "cash_journal_entries" DROP CONSTRAINT IF EXISTS "FK_cash_journal_fund"`);
    await queryRunner.query(`ALTER TABLE "vendor_payments" DROP COLUMN IF EXISTS "cost_category"`);
    await queryRunner.query(`ALTER TABLE "vendor_payments" DROP COLUMN IF EXISTS "fund_id"`);
    await queryRunner.query(`ALTER TABLE "cash_journal_entries" DROP COLUMN IF EXISTS "created_by_name"`);
    await queryRunner.query(`ALTER TABLE "cash_journal_entries" DROP COLUMN IF EXISTS "created_by_id"`);
    await queryRunner.query(`ALTER TABLE "cash_journal_entries" DROP COLUMN IF EXISTS "vendor_id"`);
    await queryRunner.query(`ALTER TABLE "cash_journal_entries" DROP COLUMN IF EXISTS "fund_id"`);
  }
}
