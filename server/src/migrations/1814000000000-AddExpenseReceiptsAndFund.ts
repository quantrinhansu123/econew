import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpenseReceiptsAndFund1814000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "fund_id" bigint`);
    await queryRunner.query(`ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "receipt_urls" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await queryRunner.query(`ALTER TABLE "cash_journal_entries" ADD COLUMN IF NOT EXISTS "attachment_urls" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_expenses_fund') THEN
          ALTER TABLE "expenses"
          ADD CONSTRAINT "FK_expenses_fund"
          FOREIGN KEY ("fund_id") REFERENCES "cash_funds"("id") ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_expenses_fund_created" ON "expenses" ("fund_id", "created_at" DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_expenses_fund_created"`);
    await queryRunner.query(`ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "FK_expenses_fund"`);
    await queryRunner.query(`ALTER TABLE "cash_journal_entries" DROP COLUMN IF EXISTS "attachment_urls"`);
    await queryRunner.query(`ALTER TABLE "expenses" DROP COLUMN IF EXISTS "receipt_urls"`);
    await queryRunner.query(`ALTER TABLE "expenses" DROP COLUMN IF EXISTS "fund_id"`);
  }
}
