import { MigrationInterface, QueryRunner } from 'typeorm';

export class LogisticsCoordinationFields1716680000011 implements MigrationInterface {
  name = 'LogisticsCoordinationFields1716680000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "receiver_phone" character varying(32);
      ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "sender_phone" character varying(32);
      ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "loaded_at" TIMESTAMP;
      ALTER TABLE "manifest_waybills" ADD COLUMN IF NOT EXISTS "loading_position" integer;
      ALTER TABLE "manifest_waybills" ADD COLUMN IF NOT EXISTS "loaded_at" TIMESTAMP;
      ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "expected_arrival_time" TIMESTAMP;
      ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "actual_total_weight" double precision;
      ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "actual_total_volume" double precision;
      ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "driver_name" character varying(255);
      ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "driver_phone" character varying(32);
      ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "category" character varying(64);
      ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "amount" numeric(18,2) DEFAULT 0;
      ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "description" character varying(500);
      ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "hub_id" bigint;
      ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "created_by" bigint;
      ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP NOT NULL DEFAULT now();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "expenses" DROP COLUMN IF EXISTS "created_at";
      ALTER TABLE "expenses" DROP COLUMN IF EXISTS "created_by";
      ALTER TABLE "expenses" DROP COLUMN IF EXISTS "hub_id";
      ALTER TABLE "expenses" DROP COLUMN IF EXISTS "description";
      ALTER TABLE "expenses" DROP COLUMN IF EXISTS "amount";
      ALTER TABLE "expenses" DROP COLUMN IF EXISTS "category";
      ALTER TABLE "trips" DROP COLUMN IF EXISTS "driver_phone";
      ALTER TABLE "trips" DROP COLUMN IF EXISTS "driver_name";
      ALTER TABLE "trips" DROP COLUMN IF EXISTS "actual_total_volume";
      ALTER TABLE "trips" DROP COLUMN IF EXISTS "actual_total_weight";
      ALTER TABLE "trips" DROP COLUMN IF EXISTS "expected_arrival_time";
      ALTER TABLE "manifest_waybills" DROP COLUMN IF EXISTS "loaded_at";
      ALTER TABLE "manifest_waybills" DROP COLUMN IF EXISTS "loading_position";
      ALTER TABLE "waybills" DROP COLUMN IF EXISTS "loaded_at";
      ALTER TABLE "waybills" DROP COLUMN IF EXISTS "sender_phone";
      ALTER TABLE "waybills" DROP COLUMN IF EXISTS "receiver_phone";
    `);
  }
}
