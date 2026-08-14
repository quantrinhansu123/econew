import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHubTransitDays1805000000000 implements MigrationInterface {
  name = 'AddHubTransitDays1805000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "hubs" ADD COLUMN IF NOT EXISTS "transit_days" integer NOT NULL DEFAULT 0');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "hubs" DROP COLUMN IF EXISTS "transit_days"');
  }
}
