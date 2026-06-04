import { MigrationInterface, QueryRunner } from 'typeorm';

export class LinkTrucksVendorsAndTripCost1716680000010 implements MigrationInterface {
  name = 'LinkTrucksVendorsAndTripCost1716680000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "payable_balance" numeric(18,2) NOT NULL DEFAULT 0;

      ALTER TABLE "trucks" ADD COLUMN IF NOT EXISTS "vendor_id" bigint;

      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_trucks_vendor_id'
        ) THEN
          ALTER TABLE "trucks"
            ADD CONSTRAINT "FK_trucks_vendor_id"
            FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL;
        END IF;
      END $$;

      ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "trip_cost" numeric(18,2);

      CREATE TABLE IF NOT EXISTS "vendor_debt_entries" (
        "id" BIGSERIAL NOT NULL,
        "vendor_id" bigint NOT NULL,
        "trip_id" bigint,
        "amount" numeric(18,2) NOT NULL,
        "description" character varying(500),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vendor_debt_entries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_vendor_debt_entries_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_vendor_debt_entries_trip" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL
      );

      INSERT INTO "vendors" ("code", "name", "status", "payable_balance")
      SELECT 'CONG_LE', 'Công lẻ', 'ACTIVE', 0
      WHERE NOT EXISTS (SELECT 1 FROM "vendors" WHERE "code" = 'CONG_LE' OR "name" = 'Công lẻ');

      UPDATE "trucks" t
      SET "vendor_id" = v."id"
      FROM "vendors" v
      WHERE t."vendor_id" IS NULL
        AND (v."code" = 'CONG_LE' OR v."name" = 'Công lẻ');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "vendor_debt_entries";
      ALTER TABLE "trips" DROP COLUMN IF EXISTS "trip_cost";
      ALTER TABLE "trucks" DROP CONSTRAINT IF EXISTS "FK_trucks_vendor_id";
      ALTER TABLE "trucks" DROP COLUMN IF EXISTS "vendor_id";
      ALTER TABLE "vendors" DROP COLUMN IF EXISTS "payable_balance";
    `);
  }
}
