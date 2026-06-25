import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWaybillCustomerPaymentStatus1782000000000 implements MigrationInterface {
  name = 'AddWaybillCustomerPaymentStatus1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waybills_customer_payment_status_enum') THEN
          CREATE TYPE "waybills_customer_payment_status_enum" AS ENUM ('SENT_STATEMENT', 'PAID');
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      ALTER TABLE "waybills"
      ADD COLUMN IF NOT EXISTS "customer_payment_status" "waybills_customer_payment_status_enum",
      ADD COLUMN IF NOT EXISTS "customer_payment_note" character varying(500);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "waybills"
      DROP COLUMN IF EXISTS "customer_payment_note",
      DROP COLUMN IF EXISTS "customer_payment_status";
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "waybills_customer_payment_status_enum"`);
  }
}
