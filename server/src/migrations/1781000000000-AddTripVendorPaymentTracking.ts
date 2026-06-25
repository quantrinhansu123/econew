import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTripVendorPaymentTracking1781000000000 implements MigrationInterface {
  name = 'AddTripVendorPaymentTracking1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."trips_vendor_payment_status_enum" AS ENUM('UNPAID', 'PARTIAL', 'PAID');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "trips"
      ADD COLUMN IF NOT EXISTS "vendor_payment_status" "public"."trips_vendor_payment_status_enum" NOT NULL DEFAULT 'UNPAID'
    `);
    await queryRunner.query(`
      ALTER TABLE "trips"
      ADD COLUMN IF NOT EXISTS "vendor_paid_amount" numeric NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trips" DROP COLUMN IF EXISTS "vendor_paid_amount"`);
    await queryRunner.query(`ALTER TABLE "trips" DROP COLUMN IF EXISTS "vendor_payment_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."trips_vendor_payment_status_enum"`);
  }
}
