import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTripVendorAssignment1802000000000 implements MigrationInterface {
  name = 'AddTripVendorAssignment1802000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "vendor_id" bigint`);
    await queryRunner.query(`
      UPDATE "trips" AS "trip"
      SET "vendor_id" = "truck"."vendor_id"
      FROM "trucks" AS "truck"
      WHERE "trip"."truck_id" = "truck"."id"
        AND "trip"."vendor_id" IS NULL
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_trips_vendor_id'
        ) THEN
          ALTER TABLE "trips"
            ADD CONSTRAINT "FK_trips_vendor_id"
            FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_trips_vendor_departure"
      ON "trips" ("vendor_id", "departure_time" DESC)
      WHERE "vendor_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_trips_vendor_departure"`);
    await queryRunner.query(`ALTER TABLE "trips" DROP CONSTRAINT IF EXISTS "FK_trips_vendor_id"`);
    await queryRunner.query(`ALTER TABLE "trips" DROP COLUMN IF EXISTS "vendor_id"`);
  }
}
