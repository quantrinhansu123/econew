import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeliveryPreparationNote1804000000000 implements MigrationInterface {
  name = 'AddDeliveryPreparationNote1804000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "delivery_preparation_note" varchar(500)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "delivery_preparation_note"`);
  }
}
