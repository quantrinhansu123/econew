import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWaybillReceiverCompanyName1789000000000 implements MigrationInterface {
  name = 'AddWaybillReceiverCompanyName1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "waybills"
      ADD COLUMN IF NOT EXISTS "receiver_company_name" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "receiver_company_name" character varying(255)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "receiver_company_name"`);
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "receiver_company_name"`);
  }
}
