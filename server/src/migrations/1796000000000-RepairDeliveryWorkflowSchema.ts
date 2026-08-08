import { MigrationInterface, QueryRunner } from 'typeorm';

export class RepairDeliveryWorkflowSchema1796000000000 implements MigrationInterface {
  name = 'RepairDeliveryWorkflowSchema1796000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "delivery_assignment_type" varchar(16)`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "last_mile_truck_id" bigint`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "last_mile_vendor_id" bigint`);

    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "delivery_preparation_status" varchar(32) NOT NULL DEFAULT 'PENDING_CONFIRMATION'`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "delivery_scheduled_at" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "delivery_hold_reason" varchar(500)`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "delivery_confirmed_at" TIMESTAMP`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_waybills_last_mile_truck'
            AND conrelid = 'waybills'::regclass
        ) THEN
          ALTER TABLE "waybills"
          ADD CONSTRAINT "FK_waybills_last_mile_truck"
          FOREIGN KEY ("last_mile_truck_id")
          REFERENCES "trucks"("id")
          ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_waybills_last_mile_vendor'
            AND conrelid = 'waybills'::regclass
        ) THEN
          ALTER TABLE "waybills"
          ADD CONSTRAINT "FK_waybills_last_mile_vendor"
          FOREIGN KEY ("last_mile_vendor_id")
          REFERENCES "vendors"("id")
          ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally left as a no-op: this migration repairs schema drift and
    // must not remove columns that may have been created by earlier migrations.
  }
}
