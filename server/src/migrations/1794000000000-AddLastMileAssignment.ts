import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLastMileAssignment1794000000000 implements MigrationInterface {
  name = 'AddLastMileAssignment1794000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "delivery_assignment_type" varchar(16)`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "last_mile_truck_id" bigint`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "last_mile_vendor_id" bigint`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD CONSTRAINT "FK_waybills_last_mile_truck" FOREIGN KEY ("last_mile_truck_id") REFERENCES "trucks"("id") ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD CONSTRAINT "FK_waybills_last_mile_vendor" FOREIGN KEY ("last_mile_vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "waybills" DROP CONSTRAINT IF EXISTS "FK_waybills_last_mile_vendor"`);
    await queryRunner.query(`ALTER TABLE "waybills" DROP CONSTRAINT IF EXISTS "FK_waybills_last_mile_truck"`);
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "last_mile_vendor_id"`);
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "last_mile_truck_id"`);
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "delivery_assignment_type"`);
  }
}
