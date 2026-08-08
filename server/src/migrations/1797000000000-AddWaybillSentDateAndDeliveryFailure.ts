import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWaybillSentDateAndDeliveryFailure1797000000000 implements MigrationInterface {
  name = 'AddWaybillSentDateAndDeliveryFailure1797000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "sent_date" date`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "last_delivery_failure_reason" varchar(500)`);
    await queryRunner.query(`
      UPDATE "waybills"
      SET "sent_date" = COALESCE(
        CASE
          WHEN substring(COALESCE("note", '') from 'ngay_gui=([0-9]{4}-[0-9]{2}-[0-9]{2})') <> ''
          THEN substring(COALESCE("note", '') from 'ngay_gui=([0-9]{4}-[0-9]{2}-[0-9]{2})')::date
          ELSE NULL
        END,
        "created_at"::date
      )
      WHERE "sent_date" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "last_delivery_failure_reason"`);
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "sent_date"`);
  }
}
