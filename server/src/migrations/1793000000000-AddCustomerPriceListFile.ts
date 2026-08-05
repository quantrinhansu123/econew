import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerPriceListFile1793000000000 implements MigrationInterface {
  name = 'AddCustomerPriceListFile1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
        ADD COLUMN IF NOT EXISTS "price_list_url" VARCHAR(1000),
        ADD COLUMN IF NOT EXISTS "price_list_name" VARCHAR(255)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
        DROP COLUMN IF EXISTS "price_list_name",
        DROP COLUMN IF EXISTS "price_list_url"
    `);
  }
}
