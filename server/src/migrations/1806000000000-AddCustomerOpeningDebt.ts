import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerOpeningDebt1806000000000 implements MigrationInterface {
  name = 'AddCustomerOpeningDebt1806000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
        ADD COLUMN IF NOT EXISTS "opening_debt" numeric(18,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "opening_debt"`);
  }
}
