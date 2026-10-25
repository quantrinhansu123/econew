import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeliveryDispatchPlans1833000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "delivery_dispatch" jsonb');
    await queryRunner.query('ALTER TABLE "waybill_splits" ADD COLUMN IF NOT EXISTS "delivery_dispatch" jsonb');
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_split_dispatch_vendor" ON "waybill_splits" (("delivery_dispatch"->>'vendor_id')) WHERE "delivery_dispatch"->>'kind' = 'ASSIGNMENT'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_split_dispatch_vendor"');
    await queryRunner.query('ALTER TABLE "waybill_splits" DROP COLUMN IF EXISTS "delivery_dispatch"');
    await queryRunner.query('ALTER TABLE "waybills" DROP COLUMN IF EXISTS "delivery_dispatch"');
  }
}
