import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimizeInventoryLookup1786000000000 implements MigrationInterface {
  name = 'OptimizeInventoryLookup1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_waybills_inventory_effective_hub_state_created"
      ON "waybills" (
        (COALESCE("current_hub_id", "origin_hub_id")),
        "current_state",
        "created_at" DESC
      )
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_waybills_inventory_effective_hub_state_created"
    `);
  }
}
