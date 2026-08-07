import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeliveryPreparationWorkflow1795000000000 implements MigrationInterface {
  name = 'AddDeliveryPreparationWorkflow1795000000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "delivery_preparation_status" varchar(32) NOT NULL DEFAULT 'PENDING_CONFIRMATION'`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "delivery_scheduled_at" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "delivery_hold_reason" varchar(500)`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "delivery_confirmed_at" TIMESTAMP`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "delivery_confirmed_at"`);
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "delivery_hold_reason"`);
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "delivery_scheduled_at"`);
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "delivery_preparation_status"`);
  }
}
