import { MigrationInterface, QueryRunner } from 'typeorm';

export class WaybillsListPerformanceIndexes1785000000000 implements MigrationInterface {
  name = 'WaybillsListPerformanceIndexes1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_waybills_active_created_at"
      ON "waybills" ("created_at" DESC)
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_waybills_active_dest_hub"
      ON "waybills" ("dest_hub_id")
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_waybills_active_ma_kh"
      ON "waybills" ("ma_kh")
      WHERE "deleted_at" IS NULL AND "ma_kh" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_waybills_active_ma_kh"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_waybills_active_dest_hub"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_waybills_active_created_at"`);
  }
}
