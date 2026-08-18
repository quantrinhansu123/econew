import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCodCashFunds1807000000000 implements MigrationInterface {
  name = 'AddCodCashFunds1807000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cash_funds" (
        "id" BIGSERIAL PRIMARY KEY,
        "code" varchar(32) NOT NULL,
        "name" varchar(255) NOT NULL,
        "hub_id" bigint NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "note" varchar(500) NULL,
        "created_by" bigint NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cash_funds_code" ON "cash_funds" (UPPER("code"))`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "cod_fund_id" bigint NULL`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "cod_collected_amount" numeric(14,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "waybill_cash_vouchers" ADD COLUMN IF NOT EXISTS "source_type" varchar(32) NOT NULL DEFAULT 'MANUAL'`);
    await queryRunner.query(`ALTER TABLE "waybill_cash_vouchers" ADD COLUMN IF NOT EXISTS "fund_id" bigint NULL`);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_cash_funds_hub') THEN
          ALTER TABLE "cash_funds" ADD CONSTRAINT "FK_cash_funds_hub" FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_cash_funds_created_by') THEN
          ALTER TABLE "cash_funds" ADD CONSTRAINT "FK_cash_funds_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_waybills_cod_fund') THEN
          ALTER TABLE "waybills" ADD CONSTRAINT "FK_waybills_cod_fund" FOREIGN KEY ("cod_fund_id") REFERENCES "cash_funds"("id") ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_waybill_cash_vouchers_fund') THEN
          ALTER TABLE "waybill_cash_vouchers" ADD CONSTRAINT "FK_waybill_cash_vouchers_fund" FOREIGN KEY ("fund_id") REFERENCES "cash_funds"("id") ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_waybills_cod_fund_id" ON "waybills" ("cod_fund_id") WHERE "cod_reconciled_at" IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_waybill_cod_collection_voucher" ON "waybill_cash_vouchers" ("waybill_id") WHERE "source_type" = 'COD_COLLECTION'`);
    await queryRunner.query(`
      UPDATE "waybills"
      SET "cod_reconciled_at" = NULL,
          "cod_reconciled_by" = NULL,
          "cod_fund_id" = NULL,
          "cod_collected_amount" = 0
      WHERE "cod_reconciled_at" IS NOT NULL AND "cod_fund_id" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "waybill_cash_vouchers" DROP CONSTRAINT IF EXISTS "FK_waybill_cash_vouchers_fund"`);
    await queryRunner.query(`ALTER TABLE "waybills" DROP CONSTRAINT IF EXISTS "FK_waybills_cod_fund"`);
    await queryRunner.query(`ALTER TABLE "cash_funds" DROP CONSTRAINT IF EXISTS "FK_cash_funds_created_by"`);
    await queryRunner.query(`ALTER TABLE "cash_funds" DROP CONSTRAINT IF EXISTS "FK_cash_funds_hub"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_waybill_cod_collection_voucher"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_waybills_cod_fund_id"`);
    await queryRunner.query(`ALTER TABLE "waybill_cash_vouchers" DROP COLUMN IF EXISTS "fund_id"`);
    await queryRunner.query(`ALTER TABLE "waybill_cash_vouchers" DROP COLUMN IF EXISTS "source_type"`);
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "cod_collected_amount"`);
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "cod_fund_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cash_funds"`);
  }
}
