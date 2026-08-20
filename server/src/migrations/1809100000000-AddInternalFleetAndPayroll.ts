import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInternalFleetAndPayroll1809100000000 implements MigrationInterface {
  name = 'AddInternalFleetAndPayroll1809100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trucks" ADD COLUMN IF NOT EXISTS "ownership_type" varchar(16) NOT NULL DEFAULT 'VENDOR'`);
    await queryRunner.query(`ALTER TABLE "trucks" ADD COLUMN IF NOT EXISTS "hub_id" bigint`);
    await queryRunner.query(`UPDATE "trucks" SET "ownership_type" = 'INTERNAL' WHERE UPPER(COALESCE("loai_xe", '')) IN ('NỘI BỘ', 'NOI BO')`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_trucks_ownership_type" ON "trucks" ("ownership_type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_trucks_hub_id" ON "trucks" ("hub_id")`);
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_trucks_hub') THEN
        ALTER TABLE "trucks" ADD CONSTRAINT "FK_trucks_hub" FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE SET NULL;
      END IF;
    END $$`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "monthly_salary" numeric(14,2) NOT NULL DEFAULT 0`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trucks" DROP CONSTRAINT IF EXISTS "FK_trucks_hub"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_trucks_hub_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_trucks_ownership_type"`);
    await queryRunner.query(`ALTER TABLE "trucks" DROP COLUMN IF EXISTS "hub_id"`);
    await queryRunner.query(`ALTER TABLE "trucks" DROP COLUMN IF EXISTS "ownership_type"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "monthly_salary"`);
  }
}
