import { MigrationInterface, QueryRunner } from 'typeorm';

export class IndexWaybillListPagination1826000000000 implements MigrationInterface {
  name = 'IndexWaybillListPagination1826000000000';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    // CONCURRENTLY keeps order entry available while existing data is indexed.
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_waybills_list_created_id"
      ON waybills (created_at DESC, id DESC) WHERE deleted_at IS NULL`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_waybills_list_sent_created_id"
      ON waybills (sent_date DESC NULLS LAST, created_at DESC, id DESC) WHERE deleted_at IS NULL`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_waybill_splits_waybill_packages"
      ON waybill_splits (waybill_id) INCLUDE (package_count)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX CONCURRENTLY IF EXISTS "IDX_waybill_splits_waybill_packages"');
    await queryRunner.query('DROP INDEX CONCURRENTLY IF EXISTS "IDX_waybills_list_sent_created_id"');
    await queryRunner.query('DROP INDEX CONCURRENTLY IF EXISTS "IDX_waybills_list_created_id"');
  }
}
