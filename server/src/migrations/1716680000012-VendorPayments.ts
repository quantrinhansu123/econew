import { MigrationInterface, QueryRunner } from 'typeorm';

export class VendorPayments1716680000012 implements MigrationInterface {
  name = 'VendorPayments1716680000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vendor_payments" (
        "id" BIGSERIAL NOT NULL,
        "vendor_id" bigint NOT NULL,
        "amount" numeric(18,2) NOT NULL,
        "payment_date" TIMESTAMP NOT NULL,
        "description" character varying(500),
        "created_by" bigint,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vendor_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_vendor_payments_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS "vendor_payment_trips" (
        "payment_id" bigint NOT NULL,
        "trip_id" bigint NOT NULL,
        CONSTRAINT "PK_vendor_payment_trips" PRIMARY KEY ("payment_id", "trip_id"),
        CONSTRAINT "FK_vendor_payment_trips_payment" FOREIGN KEY ("payment_id") REFERENCES "vendor_payments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_vendor_payment_trips_trip" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "idx_vendor_payments_vendor_date" ON "vendor_payments" ("vendor_id", "payment_date" DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "vendor_payment_trips";
      DROP TABLE IF EXISTS "vendor_payments";
    `);
  }
}
