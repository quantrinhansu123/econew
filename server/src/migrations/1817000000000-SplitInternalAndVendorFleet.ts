import { MigrationInterface, QueryRunner } from 'typeorm';

export class SplitInternalAndVendorFleet1817000000000 implements MigrationInterface {
  name = 'SplitInternalAndVendorFleet1817000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "vendors" ("code", "name", "status", "payable_balance")
      SELECT 'CONG_LE', 'Công lẻ', 'ACTIVE', 0
      WHERE NOT EXISTS (
        SELECT 1 FROM "vendors" WHERE "code" = 'CONG_LE' OR "name" = 'Công lẻ'
      )
    `);
    await queryRunner.query(`
      UPDATE "trucks" truck
      SET "vendor_id" = recent."vendor_id",
          "nha_xe" = COALESCE(NULLIF(TRIM(truck."nha_xe"), ''), recent."vendor_name")
      FROM (
        SELECT DISTINCT ON (trip."truck_id")
          trip."truck_id", trip."vendor_id", vendor."name" AS "vendor_name", vendor."code" AS "vendor_code"
        FROM "trips" trip
        JOIN "vendors" vendor ON vendor."id" = trip."vendor_id"
        WHERE trip."truck_id" IS NOT NULL AND trip."vendor_id" IS NOT NULL
        ORDER BY trip."truck_id", trip."departure_time" DESC NULLS LAST, trip."id" DESC
      ) recent
      WHERE truck."id" = recent."truck_id"
        AND COALESCE(truck."ownership_type", 'VENDOR') <> 'INTERNAL'
        AND (
          truck."vendor_id" IS NULL
          OR (
            EXISTS (SELECT 1 FROM "vendors" current_vendor WHERE current_vendor."id" = truck."vendor_id" AND current_vendor."code" = 'CONG_LE')
            AND recent."vendor_code" <> 'CONG_LE'
          )
        )
    `);
    await queryRunner.query(`
      UPDATE "trucks"
      SET "driver_id" = NULL, "ten_lai_xe" = NULL, "hub_id" = NULL
      WHERE COALESCE("ownership_type", 'VENDOR') = 'VENDOR'
    `);
    await queryRunner.query(`
      UPDATE "trucks" truck
      SET "vendor_id" = manual."vendor_id", "nha_xe" = manual."vendor_name"
      FROM (
        SELECT DISTINCT ON (UPPER(TRIM(trip."manual_license_plate")))
          UPPER(TRIM(trip."manual_license_plate")) AS "plate",
          trip."vendor_id", vendor."name" AS "vendor_name"
        FROM "trips" trip
        JOIN "vendors" vendor ON vendor."id" = trip."vendor_id"
        WHERE NULLIF(TRIM(trip."manual_license_plate"), '') IS NOT NULL AND trip."vendor_id" IS NOT NULL
        ORDER BY UPPER(TRIM(trip."manual_license_plate")), trip."departure_time" DESC NULLS LAST, trip."id" DESC
      ) manual
      WHERE UPPER(TRIM(truck."license_plate")) = manual."plate"
        AND COALESCE(truck."ownership_type", 'VENDOR') = 'VENDOR'
        AND (
          truck."vendor_id" IS NULL
          OR EXISTS (SELECT 1 FROM "vendors" current_vendor WHERE current_vendor."id" = truck."vendor_id" AND current_vendor."code" = 'CONG_LE')
        )
    `);
    await queryRunner.query(`
      UPDATE "trucks" truck
      SET "vendor_id" = default_vendor."id",
          "nha_xe" = COALESCE(NULLIF(TRIM(truck."nha_xe"), ''), default_vendor."name")
      FROM "vendors" default_vendor
      WHERE COALESCE(truck."ownership_type", 'VENDOR') <> 'INTERNAL'
        AND truck."vendor_id" IS NULL
        AND (default_vendor."code" = 'CONG_LE' OR default_vendor."name" = 'Công lẻ')
    `);
    await queryRunner.query(`
      INSERT INTO "trucks" (
        "license_plate", "bks", "payload", "fuel_consumption_limit", "status",
        "ownership_type", "vendor_id", "nha_xe", "loai_xe"
      )
      SELECT manual."plate", manual."plate", 1, 0, 'AVAILABLE',
        'VENDOR', manual."vendor_id", vendor."name", 'ĐỐI TÁC'
      FROM (
        SELECT DISTINCT ON (UPPER(TRIM(trip."manual_license_plate")))
          UPPER(TRIM(trip."manual_license_plate")) AS "plate",
          COALESCE(
            trip."vendor_id",
            (SELECT "id" FROM "vendors" WHERE "code" = 'CONG_LE' OR "name" = 'Công lẻ' ORDER BY "id" LIMIT 1)
          ) AS "vendor_id"
        FROM "trips" trip
        WHERE NULLIF(TRIM(trip."manual_license_plate"), '') IS NOT NULL
        ORDER BY UPPER(TRIM(trip."manual_license_plate")),
          CASE WHEN trip."vendor_id" IS NULL THEN 1 ELSE 0 END,
          trip."departure_time" DESC NULLS LAST,
          trip."id" DESC
      ) manual
      JOIN "vendors" vendor ON vendor."id" = manual."vendor_id"
      WHERE NOT EXISTS (
        SELECT 1 FROM "trucks" existing
        WHERE UPPER(TRIM(existing."license_plate")) = manual."plate"
      )
    `);
  }

  public async down(): Promise<void> {
    // Dữ liệu BKS/NCC đã được hợp nhất từ lịch sử chuyến; không xóa khi rollback để tránh mất dữ liệu.
  }
}
