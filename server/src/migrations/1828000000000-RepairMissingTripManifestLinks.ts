import { MigrationInterface, QueryRunner } from 'typeorm';

/** Recover cargo visibility from existing allocations without changing shipments or trips. */
export class RepairMissingTripManifestLinks1828000000000 implements MigrationInterface {
  name = 'RepairMissingTripManifestLinks1828000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "manifest_waybills" (
        "manifest_id", "waybill_id", "loading_position", "loaded_at", "dispatch_fields"
      )
      SELECT
        "trip"."manifest_id",
        "split"."waybill_id",
        MIN("split"."loading_position") FILTER (WHERE "split"."loading_position" > 0),
        MIN("split"."created_at") FILTER (WHERE "split"."load_status" <> 'WAITING_LOAD'),
        jsonb_strip_nulls(jsonb_build_object(
          'so_luong', SUM("split"."package_count")::text,
          'ma_tinh', "hub"."code",
          'expected_arrival_at', MAX("split"."expected_arrival_at")
        ))
      FROM "waybill_splits" "split"
      JOIN "trips" "trip" ON "trip"."id" = "split"."trip_id"
      JOIN "manifests" "manifest" ON "manifest"."id" = "trip"."manifest_id"
      JOIN "waybills" "waybill" ON "waybill"."id" = "split"."waybill_id"
      LEFT JOIN "hubs" "hub" ON "hub"."id" = "waybill"."dest_hub_id"
      WHERE "waybill"."deleted_at" IS NULL
        AND "waybill"."current_state" <> 'CANCELLED'
        AND "trip"."status" <> 'CANCELLED'
        AND "manifest"."status" <> 'CANCELLED'
        AND "split"."package_count" > 0
        AND NOT EXISTS (
          SELECT 1 FROM "manifest_waybills" "existing"
          WHERE "existing"."manifest_id" = "trip"."manifest_id"
            AND "existing"."waybill_id" = "split"."waybill_id"
        )
      GROUP BY "trip"."manifest_id", "split"."waybill_id", "hub"."code"
      ON CONFLICT ("manifest_id", "waybill_id") DO NOTHING
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Recovered links are valid cargo records; keep them on rollback.
  }
}
