import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWaybillDeliveryAttempts1788000000000 implements MigrationInterface {
  name = 'AddWaybillDeliveryAttempts1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "waybills"
        ADD COLUMN IF NOT EXISTS "delivery_attempt_count" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "last_delivery_attempt_at" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "return_reason" character varying(500),
        ADD COLUMN IF NOT EXISTS "return_action" character varying(32),
        ADD COLUMN IF NOT EXISTS "redelivery_address" character varying(500);

      CREATE TABLE IF NOT EXISTS "waybill_delivery_attempts" (
        "id" BIGSERIAL NOT NULL,
        "waybill_id" bigint NOT NULL,
        "attempt_number" integer NOT NULL,
        "status" character varying(32) NOT NULL,
        "driver_id" bigint,
        "delivery_vehicle" character varying(128),
        "delivery_address" character varying(500),
        "delivery_photo_url" text,
        "return_reason" character varying(500),
        "return_action" character varying(32),
        "redelivery_address" character varying(500),
        "started_at" TIMESTAMP NOT NULL,
        "completed_at" TIMESTAMP,
        "created_by" bigint,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_waybill_delivery_attempts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_waybill_delivery_attempts_waybill" FOREIGN KEY ("waybill_id") REFERENCES "waybills"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_waybill_delivery_attempts_driver" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS "IDX_waybill_delivery_attempts_waybill_number"
        ON "waybill_delivery_attempts" ("waybill_id", "attempt_number");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "waybill_delivery_attempts";
      ALTER TABLE "waybills"
        DROP COLUMN IF EXISTS "redelivery_address",
        DROP COLUMN IF EXISTS "return_action",
        DROP COLUMN IF EXISTS "return_reason",
        DROP COLUMN IF EXISTS "last_delivery_attempt_at",
        DROP COLUMN IF EXISTS "delivery_attempt_count";
    `);
  }
}
