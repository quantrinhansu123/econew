import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCancelledTripStatus1799000000000 implements MigrationInterface {
  name = 'AddCancelledTripStatus1799000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."trips_status_enum"
      ADD VALUE IF NOT EXISTS 'CANCELLED'
    `);
  }

  async down(): Promise<void> {
    // PostgreSQL cannot safely remove one enum value while rows may use it.
  }
}
