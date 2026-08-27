import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTruckDocumentImages1819000000000 implements MigrationInterface {
  name = 'AddTruckDocumentImages1819000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trucks" ADD COLUMN IF NOT EXISTS "document_image_urls" jsonb NOT NULL DEFAULT '[]'::jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trucks" DROP COLUMN IF EXISTS "document_image_urls"`);
  }
}
