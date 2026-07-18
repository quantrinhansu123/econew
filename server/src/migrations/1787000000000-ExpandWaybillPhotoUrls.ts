import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandWaybillPhotoUrls1787000000000 implements MigrationInterface {
  name = 'ExpandWaybillPhotoUrls1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "waybills" ALTER COLUMN "delivery_photo_url" TYPE text',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "waybills" ALTER COLUMN "delivery_photo_url" TYPE character varying(500) USING LEFT("delivery_photo_url", 500)',
    );
  }
}
