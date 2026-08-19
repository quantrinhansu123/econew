import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWaybillWarehouseIntake1809000000000 implements MigrationInterface {
  name = 'AddWaybillWarehouseIntake1809000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "warehouse_intake_method" character varying(24);
      ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "warehouse_intake_truck_id" bigint;
      ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "warehouse_intake_vendor_id" bigint;
      ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "warehouse_intake_driver_id" bigint;
      ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "warehouse_intake_license_plate" character varying(32);
      ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "warehouse_intake_driver_name" character varying(255);
      ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "warehouse_intake_vendor_name" character varying(255);
      ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "warehouse_intake_note" character varying(500);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const columns = [
      'warehouse_intake_note',
      'warehouse_intake_vendor_name',
      'warehouse_intake_driver_name',
      'warehouse_intake_license_plate',
      'warehouse_intake_driver_id',
      'warehouse_intake_vendor_id',
      'warehouse_intake_truck_id',
      'warehouse_intake_method',
    ];
    for (const column of columns) {
      await queryRunner.query(`ALTER TABLE "waybills" DROP COLUMN IF EXISTS "${column}"`);
    }
  }
}
