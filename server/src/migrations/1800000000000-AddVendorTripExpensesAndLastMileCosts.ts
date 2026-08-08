import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVendorTripExpensesAndLastMileCosts1800000000000 implements MigrationInterface {
  name = 'AddVendorTripExpensesAndLastMileCosts1800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "vendor_id" bigint`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_expenses_vendor_id'
        ) THEN
          ALTER TABLE "expenses"
            ADD CONSTRAINT "FK_expenses_vendor_id"
            FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_expenses_vendor_created"
      ON "expenses" ("vendor_id", "created_at" DESC)
      WHERE "vendor_id" IS NOT NULL
    `);

    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "last_mile_driver_name" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "last_mile_license_plate" character varying(32)`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "last_mile_cost_amount" numeric(18,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_waybills_last_mile_vendor_plate"
      ON "waybills" ("last_mile_vendor_id", "last_mile_license_plate")
      WHERE "last_mile_vendor_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_waybills_last_mile_vendor_plate"`);
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "last_mile_cost_amount"`);
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "last_mile_license_plate"`);
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "last_mile_driver_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_expenses_vendor_created"`);
    await queryRunner.query(`ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "FK_expenses_vendor_id"`);
    await queryRunner.query(`ALTER TABLE "expenses" DROP COLUMN IF EXISTS "vendor_id"`);
  }
}
