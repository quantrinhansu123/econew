import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVendorPaymentProfile1810000000000 implements MigrationInterface {
  name = 'AddVendorPaymentProfile1810000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "opening_debt" numeric(18,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "bank_name" varchar(255)`);
    await queryRunner.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "bank_account" varchar(64)`);
    await queryRunner.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "bank_account_holder" varchar(255)`);
    await queryRunner.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "qr_image_url" varchar(1000)`);
    await queryRunner.query(`
      UPDATE "trucks"
      SET "driver_id" = NULL,
          "ten_lai_xe" = NULL,
          "vendor_id" = NULL,
          "nha_xe" = NULL
      WHERE "ownership_type" = 'INTERNAL'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN IF EXISTS "qr_image_url"`);
    await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN IF EXISTS "bank_account_holder"`);
    await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN IF EXISTS "bank_account"`);
    await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN IF EXISTS "bank_name"`);
    await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN IF EXISTS "opening_debt"`);
  }
}
