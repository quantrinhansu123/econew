import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTripManualLicensePlate1803000000000 implements MigrationInterface {
  name = 'AddTripManualLicensePlate1803000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "manual_license_plate" varchar(32)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trips" DROP COLUMN IF EXISTS "manual_license_plate"`);
  }
}
