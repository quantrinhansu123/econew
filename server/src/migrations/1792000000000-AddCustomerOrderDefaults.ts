import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerOrderDefaults1792000000000 implements MigrationInterface {
  name = 'AddCustomerOrderDefaults1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
        ADD COLUMN IF NOT EXISTS "default_service" VARCHAR(64),
        ADD COLUMN IF NOT EXISTS "default_delivery_method" VARCHAR(64),
        ADD COLUMN IF NOT EXISTS "default_billing_unit" VARCHAR(32),
        ADD COLUMN IF NOT EXISTS "default_payment_method" VARCHAR(64),
        ADD COLUMN IF NOT EXISTS "default_special_goods" VARCHAR(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
        DROP COLUMN IF EXISTS "default_special_goods",
        DROP COLUMN IF EXISTS "default_payment_method",
        DROP COLUMN IF EXISTS "default_billing_unit",
        DROP COLUMN IF EXISTS "default_delivery_method",
        DROP COLUMN IF EXISTS "default_service"
    `);
  }
}
