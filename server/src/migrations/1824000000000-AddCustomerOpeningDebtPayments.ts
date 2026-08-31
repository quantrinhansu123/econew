import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerOpeningDebtPayments1824000000000 implements MigrationInterface {
  name = 'AddCustomerOpeningDebtPayments1824000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "waybill_cash_vouchers" ALTER COLUMN "waybill_id" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "waybill_cash_vouchers" ALTER COLUMN "waybill_code" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "waybill_cash_vouchers" ADD COLUMN IF NOT EXISTS "customer_id" bigint NULL`);
    await queryRunner.query(`ALTER TABLE "waybill_cash_vouchers" ADD COLUMN IF NOT EXISTS "customer_code" varchar(64) NULL`);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_waybill_cash_vouchers_customer') THEN
          ALTER TABLE "waybill_cash_vouchers"
          ADD CONSTRAINT "FK_waybill_cash_vouchers_customer"
          FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_waybill_cash_vouchers_customer" ON "waybill_cash_vouchers" ("customer_id", "source_type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_waybill_cash_vouchers_customer_code" ON "waybill_cash_vouchers" (UPPER(TRIM("customer_code")))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "waybill_cash_vouchers" WHERE "source_type" = 'OPENING_DEBT'`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_waybill_cash_vouchers_customer_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_waybill_cash_vouchers_customer"`);
    await queryRunner.query(`ALTER TABLE "waybill_cash_vouchers" DROP CONSTRAINT IF EXISTS "FK_waybill_cash_vouchers_customer"`);
    await queryRunner.query(`ALTER TABLE "waybill_cash_vouchers" DROP COLUMN IF EXISTS "customer_code"`);
    await queryRunner.query(`ALTER TABLE "waybill_cash_vouchers" DROP COLUMN IF EXISTS "customer_id"`);
    await queryRunner.query(`ALTER TABLE "waybill_cash_vouchers" ALTER COLUMN "waybill_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "waybill_cash_vouchers" ALTER COLUMN "waybill_code" SET NOT NULL`);
  }
}
