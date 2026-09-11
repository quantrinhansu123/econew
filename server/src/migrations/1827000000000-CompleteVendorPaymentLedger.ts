import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Completes the vendor payment schema introduced by the legacy payment
 * migration.  That migration only created description/created_by, while the
 * entity and API already read fund_id and cost_category; on databases that
 * had not received an ad-hoc ALTER TABLE every payment request therefore
 * failed with a generic 500.  The allocation table makes multi-trip payments
 * auditable without guessing an equal split later.
 */
export class CompleteVendorPaymentLedger1827000000000 implements MigrationInterface {
  name = 'CompleteVendorPaymentLedger1827000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendor_payments"
        ADD COLUMN IF NOT EXISTS "fund_id" bigint NULL,
        ADD COLUMN IF NOT EXISTS "cost_category" varchar(255) NULL,
        ADD COLUMN IF NOT EXISTS "proof_image_url" varchar(500) NULL
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_vendor_payments_fund') THEN
          ALTER TABLE "vendor_payments"
            ADD CONSTRAINT "FK_vendor_payments_fund"
            FOREIGN KEY ("fund_id") REFERENCES "cash_funds"("id") ON DELETE SET NULL;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vendor_payment_allocations" (
        "payment_id" bigint NOT NULL,
        "trip_id" bigint NOT NULL,
        "amount" numeric(18,2) NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vendor_payment_allocations" PRIMARY KEY ("payment_id", "trip_id")
      )
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_vendor_payment_allocations_payment') THEN
          ALTER TABLE "vendor_payment_allocations"
            ADD CONSTRAINT "FK_vendor_payment_allocations_payment"
            FOREIGN KEY ("payment_id") REFERENCES "vendor_payments"("id") ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_vendor_payment_allocations_trip') THEN
          ALTER TABLE "vendor_payment_allocations"
            ADD CONSTRAINT "FK_vendor_payment_allocations_trip"
            FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_vendor_payment_allocations_trip"
      ON "vendor_payment_allocations" ("trip_id", "created_at" DESC)
    `);

    // Legacy payments only recorded the linked trips. Preserve their audit
    // trail with a deterministic allocation so future deletes/reports do not
    // divide the amount differently on each request. The last trip receives
    // the rounding remainder so allocations always add up to the payment.
    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          link."payment_id",
          link."trip_id",
          payment."amount",
          ROW_NUMBER() OVER (PARTITION BY link."payment_id" ORDER BY link."trip_id") AS row_number,
          COUNT(*) OVER (PARTITION BY link."payment_id") AS trip_count
        FROM "vendor_payment_trips" link
        JOIN "vendor_payments" payment ON payment."id" = link."payment_id"
      )
      INSERT INTO "vendor_payment_allocations" ("payment_id", "trip_id", "amount")
      SELECT
        "payment_id",
        "trip_id",
        CASE
          WHEN "row_number" = "trip_count"
            THEN "amount" - (ROUND(("amount" / NULLIF("trip_count", 0))::numeric, 2) * ("trip_count" - 1))
          ELSE ROUND(("amount" / NULLIF("trip_count", 0))::numeric, 2)
        END
      FROM ranked
      ON CONFLICT ("payment_id", "trip_id") DO NOTHING
    `);

    // Keep legacy status values in sync with the money columns. New writes
    // calculate the same status under row locks in VendorsService.
    await queryRunner.query(`
      UPDATE "trips"
      SET "vendor_payment_status" = CASE
        WHEN COALESCE("trip_cost", "other_costs", 0) <= 0 AND COALESCE("vendor_paid_amount", 0) > 0 THEN 'PAID'
        WHEN COALESCE("trip_cost", "other_costs", 0) <= 0 THEN 'UNPAID'
        WHEN COALESCE("vendor_paid_amount", 0) >= COALESCE("trip_cost", "other_costs", 0) THEN 'PAID'
        WHEN COALESCE("vendor_paid_amount", 0) > 0 THEN 'PARTIAL'
        ELSE 'UNPAID'
      END::"public"."trips_vendor_payment_status_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_vendor_payment_allocations_trip"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_payment_allocations"`);
    await queryRunner.query(`ALTER TABLE "vendor_payments" DROP CONSTRAINT IF EXISTS "FK_vendor_payments_fund"`);
    await queryRunner.query(`ALTER TABLE "vendor_payments" DROP COLUMN IF EXISTS "proof_image_url"`);
    await queryRunner.query(`ALTER TABLE "vendor_payments" DROP COLUMN IF EXISTS "cost_category"`);
    await queryRunner.query(`ALTER TABLE "vendor_payments" DROP COLUMN IF EXISTS "fund_id"`);
  }
}
