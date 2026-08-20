import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCashJournalHub1813000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cash_journal_entries" ADD COLUMN IF NOT EXISTS "hub_id" bigint`);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_cash_journal_hub') THEN
          ALTER TABLE "cash_journal_entries"
          ADD CONSTRAINT "FK_cash_journal_hub"
          FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      UPDATE "cash_journal_entries" journal
      SET "hub_id" = fund."hub_id"
      FROM "cash_funds" fund
      WHERE journal."fund_id" = fund."id"
        AND journal."hub_id" IS NULL
        AND fund."hub_id" IS NOT NULL
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cash_journal_hub_date" ON "cash_journal_entries" ("hub_id", "entry_date" DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cash_journal_hub_date"`);
    await queryRunner.query(`ALTER TABLE "cash_journal_entries" DROP CONSTRAINT IF EXISTS "FK_cash_journal_hub"`);
    await queryRunner.query(`ALTER TABLE "cash_journal_entries" DROP COLUMN IF EXISTS "hub_id"`);
  }
}
