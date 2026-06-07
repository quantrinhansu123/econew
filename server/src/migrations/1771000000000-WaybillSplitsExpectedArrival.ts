import { MigrationInterface, QueryRunner } from 'typeorm';

export class WaybillSplitsExpectedArrival1771000000000 implements MigrationInterface {
  name = 'WaybillSplitsExpectedArrival1771000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "waybill_splits"
      ADD COLUMN IF NOT EXISTS "expected_arrival_at" TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "waybill_splits" DROP COLUMN IF EXISTS "expected_arrival_at"`);
  }
}
