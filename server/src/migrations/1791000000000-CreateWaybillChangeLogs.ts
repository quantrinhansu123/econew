import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWaybillChangeLogs1791000000000 implements MigrationInterface {
  name = 'CreateWaybillChangeLogs1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "waybill_change_logs" (
        "id" BIGSERIAL PRIMARY KEY,
        "waybill_id" BIGINT NOT NULL,
        "action" VARCHAR(32) NOT NULL,
        "changes" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "changed_by_id" BIGINT,
        "changed_by_name" VARCHAR(255),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_waybill_change_logs_waybill"
          FOREIGN KEY ("waybill_id") REFERENCES "waybills"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_waybill_change_logs_user"
          FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_waybill_change_logs_waybill_created"
      ON "waybill_change_logs" ("waybill_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      INSERT INTO "waybill_change_logs"
        ("waybill_id", "action", "changes", "changed_by_id", "changed_by_name", "created_at")
      SELECT
        waybill."id",
        'CREATED',
        '{}'::jsonb,
        waybill."created_by",
        COALESCE(NULLIF(BTRIM("user"."full_name"), ''), NULLIF(BTRIM("user"."username"), ''), 'Hệ thống'),
        waybill."created_at"
      FROM "waybills" waybill
      LEFT JOIN "users" "user" ON "user"."id" = waybill."created_by"
      WHERE NOT EXISTS (
        SELECT 1 FROM "waybill_change_logs" log
        WHERE log."waybill_id" = waybill."id" AND log."action" = 'CREATED'
      )
    `);

    await queryRunner.query(`
      INSERT INTO "waybill_change_logs"
        ("waybill_id", "action", "changes", "changed_by_id", "changed_by_name", "created_at")
      SELECT
        waybill."id",
        'LEGACY_UPDATE',
        '{}'::jsonb,
        waybill."updated_by",
        COALESCE(NULLIF(BTRIM("user"."full_name"), ''), NULLIF(BTRIM("user"."username"), ''), 'Hệ thống'),
        waybill."updated_at"
      FROM "waybills" waybill
      LEFT JOIN "users" "user" ON "user"."id" = waybill."updated_by"
      WHERE waybill."updated_at" IS NOT NULL
        AND waybill."updated_at" > waybill."created_at" + INTERVAL '1 second'
        AND NOT EXISTS (
          SELECT 1 FROM "waybill_change_logs" log
          WHERE log."waybill_id" = waybill."id" AND log."action" = 'LEGACY_UPDATE'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "waybill_change_logs"`);
  }
}
