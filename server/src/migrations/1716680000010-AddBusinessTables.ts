import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBusinessTables1716680000010 implements MigrationInterface {
  name = 'AddBusinessTables1716680000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vehicle_directory" (
        "id" BIGSERIAL PRIMARY KEY,
        "driver_name" character varying NOT NULL,
        "region" character varying NOT NULL,
        "carrier_name" character varying NOT NULL,
        "license_plate" character varying NOT NULL UNIQUE,
        "vehicle_type" character varying NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_vehicle_directory_license_plate" ON "vehicle_directory" ("license_plate")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vehicle_costs" (
        "id" BIGSERIAL PRIMARY KEY,
        "cost_date" date NOT NULL,
        "license_plate" character varying NOT NULL,
        "vehicle_type" character varying NOT NULL,
        "cost_type" character varying NOT NULL,
        "amount" numeric(14,2) NOT NULL DEFAULT 0,
        "status" character varying NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_vehicle_costs_cost_date" ON "vehicle_costs" ("cost_date")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_vehicle_costs_license_plate" ON "vehicle_costs" ("license_plate")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cash_transaction_details" (
        "id" BIGSERIAL PRIMARY KEY,
        "vehicle_cost_id" bigint NOT NULL,
        "voucher_type" character varying NOT NULL,
        "voucher_name" character varying NOT NULL,
        "service_type" character varying NOT NULL,
        "counterparty_unit" character varying NOT NULL,
        "content" character varying NOT NULL,
        "performed_by" character varying NOT NULL,
        "entry_date" date NOT NULL,
        "entry_time" time NOT NULL,
        "note" character varying,
        "amount" numeric(14,2) NOT NULL DEFAULT 0,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_cash_transaction_details_vehicle_cost" FOREIGN KEY ("vehicle_cost_id") REFERENCES "vehicle_costs"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cash_transaction_details_entry_date" ON "cash_transaction_details" ("entry_date")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "north_south_shipments" (
        "id" BIGSERIAL PRIMARY KEY,
        "bill" character varying NOT NULL,
        "goods_name" character varying NOT NULL,
        "package_count" integer NOT NULL DEFAULT 0,
        "volume" numeric(12,3) NOT NULL DEFAULT 0,
        "weight" numeric(12,3) NOT NULL DEFAULT 0,
        "service_type" character varying NOT NULL,
        "destination" character varying NOT NULL,
        "address" character varying NOT NULL,
        "unit" character varying NOT NULL,
        "unit_price" numeric(14,2) NOT NULL DEFAULT 0,
        "transfer_fee" numeric(14,2) NOT NULL DEFAULT 0,
        "total_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "cod_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "payment_method" character varying NOT NULL,
        "note" character varying,
        "pickup_vehicle_status" character varying,
        "external_vehicle_cost" numeric(14,2) NOT NULL DEFAULT 0,
        "external_vehicle_payment_method" character varying,
        "customer_discount" numeric(14,2) NOT NULL DEFAULT 0,
        "final_profit" numeric(14,2) NOT NULL DEFAULT 0,
        "carrier_holding_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_north_south_shipments_bill" ON "north_south_shipments" ("bill")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "staff_members" (
        "id" BIGSERIAL PRIMARY KEY,
        "full_name" character varying NOT NULL,
        "department" character varying NOT NULL,
        "position" character varying NOT NULL,
        "phone" character varying NOT NULL UNIQUE,
        "password_hash" character varying NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_staff_members_phone" ON "staff_members" ("phone")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "carrier_directory" (
        "id" BIGSERIAL PRIMARY KEY,
        "region" character varying NOT NULL,
        "carrier_name" character varying NOT NULL,
        "license_plate" character varying NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_carrier_directory_license_plate" ON "carrier_directory" ("license_plate")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chanh_shipments" (
        "id" BIGSERIAL PRIMARY KEY,
        "province_code" character varying NOT NULL,
        "bill_count" integer NOT NULL DEFAULT 0,
        "company_name" character varying NOT NULL,
        "goods_name" character varying NOT NULL,
        "quantity" numeric(12,3) NOT NULL DEFAULT 0,
        "goods_type" character varying NOT NULL,
        "unit_price" numeric(14,2) NOT NULL DEFAULT 0,
        "cost_type" character varying NOT NULL,
        "note" character varying,
        "carrier_name" character varying NOT NULL,
        "license_plate" character varying NOT NULL,
        "shipment_date" date NOT NULL,
        "bo_fee" numeric(14,2) NOT NULL DEFAULT 0,
        "bill" character varying NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_chanh_shipments_shipment_date" ON "chanh_shipments" ("shipment_date")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_chanh_shipments_license_plate" ON "chanh_shipments" ("license_plate")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_chanh_shipments_bill" ON "chanh_shipments" ("bill")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_directory" (
        "id" BIGSERIAL PRIMARY KEY,
        "full_name" character varying NOT NULL,
        "phone" character varying NOT NULL,
        "address" character varying NOT NULL,
        "customer_code" character varying NOT NULL UNIQUE,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_customer_directory_customer_code" ON "customer_directory" ("customer_code")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cash_journal_entries" (
        "id" BIGSERIAL PRIMARY KEY,
        "entry_date" date NOT NULL,
        "voucher_type" character varying NOT NULL,
        "source" character varying NOT NULL,
        "cost_category" character varying NOT NULL,
        "detail" character varying NOT NULL,
        "note" character varying,
        "content" character varying NOT NULL,
        "income_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "expense_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cash_journal_entries_entry_date" ON "cash_journal_entries" ("entry_date")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "warehouses" (
        "id" BIGSERIAL PRIMARY KEY,
        "warehouse_name" character varying NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "warehouses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cash_journal_entries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_directory"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chanh_shipments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "carrier_directory"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "north_south_shipments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cash_transaction_details"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vehicle_costs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vehicle_directory"`);
  }
}
