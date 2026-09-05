import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillTripVendorFromDebtEntries1825000000000 implements MigrationInterface {
  name = 'BackfillTripVendorFromDebtEntries1825000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH "unambiguous_trip_vendors" AS (
        SELECT
          "entry"."trip_id",
          MIN("entry"."vendor_id") AS "vendor_id"
        FROM "vendor_debt_entries" "entry"
        WHERE "entry"."trip_id" IS NOT NULL
        GROUP BY "entry"."trip_id"
        HAVING COUNT(DISTINCT "entry"."vendor_id") = 1
      )
      UPDATE "trips" "trip"
      SET "vendor_id" = "source"."vendor_id"
      FROM "unambiguous_trip_vendors" "source"
      WHERE "trip"."id" = "source"."trip_id"
        AND "trip"."vendor_id" IS NULL
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Vendor links are business data and must remain intact when reverting code.
  }
}
