import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerHanWarehouse1788000000000 implements MigrationInterface {
  name = 'AddCustomerHanWarehouse1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "receiver_han" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "address_han" character varying(500)`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "phone_han" character varying(32)`);
    await this.replaceCustomerListView(queryRunner, true);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.replaceCustomerListView(queryRunner, false);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "phone_han"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "address_han"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "receiver_han"`);
  }

  private async replaceCustomerListView(queryRunner: QueryRunner, includeHan: boolean): Promise<void> {
    const hanColumns = includeHan
      ? `c.receiver_han, c.address_han, c.phone_han,`
      : '';

    await queryRunner.query(`DROP VIEW IF EXISTS "v_customer_list"`);
    await queryRunner.query(`
      CREATE VIEW "v_customer_list" AS
      SELECT
        c.id,
        c.customer_type,
        c.is_suspended,
        c.status,
        c.code,
        c.name,
        c.short_name,
        c.english_name,
        c.address,
        c.tax_id,
        c.phone_landline,
        c.id_number,
        c.mobile,
        c.email,
        c.bank_name,
        c.bank_account,
        c.bank_account_holder,
        c.manager_name,
        c.delivery_handler,
        c.contact_person,
        c.region,
        c.destination_province,
        c.mechanism,
        c.credit_type,
        c.contract_code,
        c.price_table,
        c.discount_percent,
        c.contact_address,
        ${hanColumns}
        c.receiver_hcm,
        c.address_hcm,
        c.phone_hcm,
        c.receiver_dng,
        c.address_dng,
        c.phone_dng,
        c.created_at,
        c.updated_at,
        0::integer AS waybill_count
      FROM customers c
      WHERE c.deleted_at IS NULL
    `);
  }
}
