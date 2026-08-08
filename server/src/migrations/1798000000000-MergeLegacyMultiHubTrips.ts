import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Earlier versions created one trip per destination HUB even when all rows were
 * stacked onto the same vehicle in one departure. Consolidate only the very
 * conservative legacy signature: same truck, origin and exact departure time,
 * created within 15 minutes, with more than one destination HUB.
 */
export class MergeLegacyMultiHubTrips1798000000000 implements MigrationInterface {
  name = 'MergeLegacyMultiHubTrips1798000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TEMP TABLE "legacy_multi_hub_trip_merge" (
        "keeper_trip_id" bigint NOT NULL,
        "duplicate_trip_id" bigint NOT NULL,
        "keeper_manifest_id" bigint NOT NULL,
        "duplicate_manifest_id" bigint NOT NULL,
        PRIMARY KEY ("duplicate_trip_id")
      )
    `);

    await queryRunner.query(`
      WITH "candidate_groups" AS (
        SELECT
          "truck_id",
          "start_hub_id",
          "departure_time",
          (array_agg(
            "id"
            ORDER BY
              CASE "status" WHEN 'IN_TRANSIT' THEN 2 ELSE 1 END DESC,
              "id" ASC
          ))[1] AS "keeper_trip_id"
        FROM "trips"
        WHERE "truck_id" IS NOT NULL
          AND "manifest_id" IS NOT NULL
          AND "status" IN ('PLANNED', 'IN_TRANSIT')
        GROUP BY "truck_id", "start_hub_id", "departure_time"
        HAVING COUNT(*) > 1
          AND COUNT(DISTINCT "end_hub_id") > 1
          AND MAX("created_at") - MIN("created_at") <= INTERVAL '15 minutes'
          AND COUNT(DISTINCT COALESCE("driver_name", '')) <= 1
          AND COUNT(DISTINCT COALESCE("driver_phone", '')) <= 1
      )
      INSERT INTO "legacy_multi_hub_trip_merge" (
        "keeper_trip_id",
        "duplicate_trip_id",
        "keeper_manifest_id",
        "duplicate_manifest_id"
      )
      SELECT
        "grouped"."keeper_trip_id",
        "duplicate"."id",
        "keeper"."manifest_id",
        "duplicate"."manifest_id"
      FROM "candidate_groups" "grouped"
      JOIN "trips" "keeper" ON "keeper"."id" = "grouped"."keeper_trip_id"
      JOIN "trips" "duplicate"
        ON "duplicate"."truck_id" = "grouped"."truck_id"
       AND "duplicate"."start_hub_id" = "grouped"."start_hub_id"
       AND "duplicate"."departure_time" = "grouped"."departure_time"
       AND "duplicate"."id" <> "grouped"."keeper_trip_id"
       AND "duplicate"."status" IN ('PLANNED', 'IN_TRANSIT')
      WHERE "duplicate"."manifest_id" IS NOT NULL
    `);

    await queryRunner.query(`
      INSERT INTO "manifest_waybills" (
        "manifest_id",
        "waybill_id",
        "loading_position",
        "loaded_at",
        "dispatch_fields"
      )
      SELECT
        "merge"."keeper_manifest_id",
        "link"."waybill_id",
        "link"."loading_position",
        "link"."loaded_at",
        "link"."dispatch_fields"
      FROM "legacy_multi_hub_trip_merge" "merge"
      JOIN "manifest_waybills" "link"
        ON "link"."manifest_id" = "merge"."duplicate_manifest_id"
      ON CONFLICT ("manifest_id", "waybill_id") DO UPDATE SET
        "loading_position" = COALESCE(EXCLUDED."loading_position", "manifest_waybills"."loading_position"),
        "loaded_at" = COALESCE(EXCLUDED."loaded_at", "manifest_waybills"."loaded_at"),
        "dispatch_fields" = COALESCE(EXCLUDED."dispatch_fields", "manifest_waybills"."dispatch_fields")
    `);

    await queryRunner.query(`
      UPDATE "waybill_splits" "split"
      SET "trip_id" = "merge"."keeper_trip_id"
      FROM "legacy_multi_hub_trip_merge" "merge"
      WHERE "split"."trip_id" = "merge"."duplicate_trip_id"
    `);

    if (await queryRunner.hasTable('expenses')) {
      await queryRunner.query(`
        UPDATE "expenses" "expense"
        SET "trip_id" = "merge"."keeper_trip_id"
        FROM "legacy_multi_hub_trip_merge" "merge"
        WHERE "expense"."trip_id" = "merge"."duplicate_trip_id"
      `);
    }

    if (await queryRunner.hasTable('vendor_debt_entries')) {
      await queryRunner.query(`
        UPDATE "vendor_debt_entries" "entry"
        SET "trip_id" = "merge"."keeper_trip_id"
        FROM "legacy_multi_hub_trip_merge" "merge"
        WHERE "entry"."trip_id" = "merge"."duplicate_trip_id"
      `);
    }

    if (await queryRunner.hasTable('vendor_payment_trips')) {
      await queryRunner.query(`
        INSERT INTO "vendor_payment_trips" ("payment_id", "trip_id")
        SELECT "payment"."payment_id", "merge"."keeper_trip_id"
        FROM "vendor_payment_trips" "payment"
        JOIN "legacy_multi_hub_trip_merge" "merge"
          ON "payment"."trip_id" = "merge"."duplicate_trip_id"
        ON CONFLICT ("payment_id", "trip_id") DO NOTHING
      `);
      await queryRunner.query(`
        DELETE FROM "vendor_payment_trips" "payment"
        USING "legacy_multi_hub_trip_merge" "merge"
        WHERE "payment"."trip_id" = "merge"."duplicate_trip_id"
      `);
    }

    await queryRunner.query(`
      WITH "trip_ids" AS (
        SELECT "keeper_trip_id", "keeper_trip_id" AS "trip_id"
        FROM "legacy_multi_hub_trip_merge"
        UNION
        SELECT "keeper_trip_id", "duplicate_trip_id" AS "trip_id"
        FROM "legacy_multi_hub_trip_merge"
      ),
      "totals" AS (
        SELECT
          "ids"."keeper_trip_id",
          MAX("trip"."expected_arrival_time") AS "expected_arrival_time",
          MAX("trip"."arrival_time") AS "arrival_time",
          SUM(COALESCE("trip"."trip_cost", 0)) AS "trip_cost",
          SUM(COALESCE("trip"."other_costs", 0)) AS "other_costs",
          SUM(COALESCE("trip"."actual_total_weight", 0)) AS "actual_total_weight",
          SUM(COALESCE("trip"."actual_total_volume", 0)) AS "actual_total_volume"
        FROM "trip_ids" "ids"
        JOIN "trips" "trip" ON "trip"."id" = "ids"."trip_id"
        GROUP BY "ids"."keeper_trip_id"
      )
      UPDATE "trips" "keeper"
      SET
        "expected_arrival_time" = "totals"."expected_arrival_time",
        "arrival_time" = "totals"."arrival_time",
        "trip_cost" = NULLIF("totals"."trip_cost", 0),
        "other_costs" = NULLIF("totals"."other_costs", 0),
        "actual_total_weight" = NULLIF("totals"."actual_total_weight", 0),
        "actual_total_volume" = NULLIF("totals"."actual_total_volume", 0)
      FROM "totals"
      WHERE "keeper"."id" = "totals"."keeper_trip_id"
    `);

    await queryRunner.query(`
      UPDATE "waybill_splits" "split"
      SET "load_status" = 'IN_TRANSIT'
      FROM "trips" "trip"
      WHERE "split"."trip_id" = "trip"."id"
        AND "trip"."id" IN (SELECT DISTINCT "keeper_trip_id" FROM "legacy_multi_hub_trip_merge")
        AND "trip"."status" = 'IN_TRANSIT'
        AND "split"."load_status" IN ('LOADED', 'DEPARTED')
    `);

    await queryRunner.query(`
      UPDATE "waybills" "waybill"
      SET "current_state" = 'IN_TRANSIT'
      FROM "manifest_waybills" "link"
      JOIN "trips" "trip" ON "trip"."manifest_id" = "link"."manifest_id"
      WHERE "waybill"."id" = "link"."waybill_id"
        AND "trip"."id" IN (SELECT DISTINCT "keeper_trip_id" FROM "legacy_multi_hub_trip_merge")
        AND "trip"."status" = 'IN_TRANSIT'
        AND "waybill"."current_state" IN ('LOADED', 'MANIFEST_CLOSED')
    `);

    await queryRunner.query(`
      UPDATE "manifests" "manifest"
      SET "status" = CASE WHEN "trip"."status" = 'IN_TRANSIT' THEN 'IN_TRANSIT' ELSE 'CLOSED' END
      FROM "trips" "trip"
      WHERE "manifest"."id" = "trip"."manifest_id"
        AND "trip"."id" IN (SELECT DISTINCT "keeper_trip_id" FROM "legacy_multi_hub_trip_merge")
    `);

    await queryRunner.query(`
      DELETE FROM "trips" "trip"
      USING "legacy_multi_hub_trip_merge" "merge"
      WHERE "trip"."id" = "merge"."duplicate_trip_id"
    `);

    await queryRunner.query(`
      DELETE FROM "manifests" "manifest"
      USING (
        SELECT DISTINCT "duplicate_manifest_id" AS "manifest_id"
        FROM "legacy_multi_hub_trip_merge"
      ) "duplicate"
      WHERE "manifest"."id" = "duplicate"."manifest_id"
        AND NOT EXISTS (SELECT 1 FROM "trips" WHERE "trips"."manifest_id" = "manifest"."id")
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "legacy_multi_hub_trip_merge"`);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Data consolidation is intentionally irreversible; no shipment rows are discarded.
  }
}
