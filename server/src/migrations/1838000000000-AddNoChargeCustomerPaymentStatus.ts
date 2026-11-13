import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNoChargeCustomerPaymentStatus1838000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE waybills_customer_payment_status_enum ADD VALUE IF NOT EXISTS 'NO_CHARGE'`);
  }

  async down(): Promise<void> {
    // Keep the additive enum value and existing no-charge marks on rollback.
  }
}
