import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWaybillCodReconciliation1801000000000 implements MigrationInterface {
  name = 'AddWaybillCodReconciliation1801000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "cod_reconciled_at" TIMESTAMP NULL`);
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "cod_reconciled_by" BIGINT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_waybills_cod_reconciled_at" ON "waybills" ("cod_reconciled_at") WHERE "payment_type" = 'COD' AND "deleted_at" IS NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_waybills_cod_reconciled_at"`);
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "cod_reconciled_by"`);
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "cod_reconciled_at"`);
  }
}
