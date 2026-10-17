import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddManifestNote1831000000000 implements MigrationInterface {
  name = 'AddManifestNote1831000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "manifests" ADD COLUMN IF NOT EXISTS "note" text`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "manifests" DROP COLUMN IF EXISTS "note"`);
  }
}
