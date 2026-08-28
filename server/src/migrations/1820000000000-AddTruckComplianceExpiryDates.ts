import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTruckComplianceExpiryDates1820000000000 implements MigrationInterface {
  name = 'AddTruckComplianceExpiryDates1820000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trucks" ADD COLUMN IF NOT EXISTS "registration_expiry_date" date`);
    await queryRunner.query(`ALTER TABLE "trucks" ADD COLUMN IF NOT EXISTS "insurance_expiry_date" date`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_trucks_registration_expiry_date" ON "trucks" ("registration_expiry_date") WHERE "ownership_type" = 'INTERNAL' AND "registration_expiry_date" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_trucks_insurance_expiry_date" ON "trucks" ("insurance_expiry_date") WHERE "ownership_type" = 'INTERNAL' AND "insurance_expiry_date" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_trucks_insurance_expiry_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_trucks_registration_expiry_date"`);
    await queryRunner.query(`ALTER TABLE "trucks" DROP COLUMN IF EXISTS "insurance_expiry_date"`);
    await queryRunner.query(`ALTER TABLE "trucks" DROP COLUMN IF EXISTS "registration_expiry_date"`);
  }
}
