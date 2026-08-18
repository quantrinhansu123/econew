import 'reflect-metadata';
import 'dotenv/config';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { getDatabaseUrl } from '../database-url';

const getPositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const ensureDeliveryWorkflowSchema = async (dataSource: DataSource) => {
  await dataSource.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "delivery_assignment_type" varchar(16)`);
  await dataSource.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "last_mile_truck_id" bigint`);
  await dataSource.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "last_mile_vendor_id" bigint`);
  await dataSource.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "delivery_preparation_status" varchar(32) NOT NULL DEFAULT 'PENDING_CONFIRMATION'`);
  await dataSource.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "delivery_scheduled_at" TIMESTAMP`);
  await dataSource.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "delivery_hold_reason" varchar(500)`);
  await dataSource.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "delivery_preparation_note" varchar(500)`);
  await dataSource.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "delivery_confirmed_at" TIMESTAMP`);
  await dataSource.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "sent_date" date`);
  await dataSource.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "last_delivery_failure_reason" varchar(500)`);
  await dataSource.query(`
    UPDATE "waybills"
    SET "sent_date" = COALESCE(
      CASE
        WHEN substring(COALESCE("note", '') from 'ngay_gui=([0-9]{4}-[0-9]{2}-[0-9]{2})') <> ''
        THEN substring(COALESCE("note", '') from 'ngay_gui=([0-9]{4}-[0-9]{2}-[0-9]{2})')::date
        ELSE NULL
      END,
      "created_at"::date
    )
    WHERE "sent_date" IS NULL
  `);
};

const ensureHubScheduleSchema = async (dataSource: DataSource) => {
  await dataSource.query(`ALTER TABLE "hubs" ADD COLUMN IF NOT EXISTS "transit_days" integer NOT NULL DEFAULT 0`);
};

const ensureCustomerOpeningDebtSchema = async (dataSource: DataSource) => {
  await dataSource.query(`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "opening_debt" numeric(18,2) NOT NULL DEFAULT 0`);
};

const ensureFundBalancesSchema = async (dataSource: DataSource) => {
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "fund_balances" (
      "id" BIGSERIAL PRIMARY KEY,
      "record_date" date NOT NULL,
      "fund_code" varchar(64) NOT NULL,
      "fund_name" varchar(255) NOT NULL,
      "hub_name" varchar(255) NULL,
      "balance_amount" numeric(14,2) NOT NULL DEFAULT 0,
      "note" varchar(512) NULL,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    )
  `);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_fund_balances_record_date" ON "fund_balances" ("record_date")`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_fund_balances_fund_code" ON "fund_balances" ("fund_code")`);
};

const ensureBusinessTablesSchema = async (dataSource: DataSource) => {
  await dataSource.query(`
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
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_vehicle_directory_license_plate" ON "vehicle_directory" ("license_plate")`);

  await dataSource.query(`
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
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_vehicle_costs_cost_date" ON "vehicle_costs" ("cost_date")`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_vehicle_costs_license_plate" ON "vehicle_costs" ("license_plate")`);

  await dataSource.query(`
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
      "updated_at" timestamp NOT NULL DEFAULT now()
    )
  `);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_cash_transaction_details_entry_date" ON "cash_transaction_details" ("entry_date")`);

  await dataSource.query(`
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
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_north_south_shipments_bill" ON "north_south_shipments" ("bill")`);

  await dataSource.query(`
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
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_staff_members_phone" ON "staff_members" ("phone")`);

  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "carrier_directory" (
      "id" BIGSERIAL PRIMARY KEY,
      "region" character varying NOT NULL,
      "carrier_name" character varying NOT NULL,
      "license_plate" character varying NOT NULL,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    )
  `);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_carrier_directory_license_plate" ON "carrier_directory" ("license_plate")`);

  await dataSource.query(`
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
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_chanh_shipments_shipment_date" ON "chanh_shipments" ("shipment_date")`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_chanh_shipments_license_plate" ON "chanh_shipments" ("license_plate")`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_chanh_shipments_bill" ON "chanh_shipments" ("bill")`);

  await dataSource.query(`
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
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_customer_directory_customer_code" ON "customer_directory" ("customer_code")`);

  await dataSource.query(`
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
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_cash_journal_entries_entry_date" ON "cash_journal_entries" ("entry_date")`);

  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "warehouses" (
      "id" BIGSERIAL PRIMARY KEY,
      "warehouse_name" character varying NOT NULL,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    )
  `);
};

const ensureOrdersAndCustomersSchema = async (dataSource: DataSource) => {
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "customers" (
      "id" BIGSERIAL PRIMARY KEY,
      "customer_type" VARCHAR(32) NOT NULL DEFAULT 'KHACH_HANG',
      "is_suspended" BOOLEAN NOT NULL DEFAULT FALSE,
      "code" VARCHAR(64) NOT NULL UNIQUE,
      "name" VARCHAR(255) NOT NULL,
      "short_name" VARCHAR(255),
      "english_name" VARCHAR(255),
      "address" VARCHAR(500),
      "tax_id" VARCHAR(32),
      "phone_landline" VARCHAR(32),
      "id_number" VARCHAR(64),
      "mobile" VARCHAR(32),
      "email" VARCHAR(255),
      "bank_name" VARCHAR(255),
      "bank_account" VARCHAR(64),
      "bank_account_holder" VARCHAR(255),
      "manager_name" VARCHAR(128),
      "delivery_handler" VARCHAR(128),
      "contact_person" VARCHAR(255),
      "region" VARCHAR(128),
      "mechanism" VARCHAR(64),
      "portal_password" VARCHAR(255),
      "credit_type" VARCHAR(16),
      "contract_code" VARCHAR(64),
      "price_table" VARCHAR(128),
      "contact_address" VARCHAR(500),
      "receiver_han" VARCHAR(255),
      "address_han" VARCHAR(500),
      "phone_han" VARCHAR(32),
      "receiver_hcm" VARCHAR(255),
      "address_hcm" VARCHAR(500),
      "phone_hcm" VARCHAR(32),
      "receiver_dng" VARCHAR(255),
      "address_dng" VARCHAR(500),
      "phone_dng" VARCHAR(32),
      "destination_province" VARCHAR(128),
      "discount_percent" NUMERIC(8, 2) NOT NULL DEFAULT 0,
      "opening_debt" NUMERIC(18, 2) NOT NULL DEFAULT 0,
      "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
      "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
      "deleted_at" TIMESTAMP
    )
  `);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "idx_customers_name" ON "customers" ("name")`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "idx_customers_mobile" ON "customers" ("mobile")`);

  await dataSource.query(`
    CREATE OR REPLACE VIEW "v_customer_list" AS
    SELECT
      c."id", c."customer_type", c."is_suspended", c."status", c."code", c."name", c."short_name", c."english_name",
      c."address", c."tax_id", c."phone_landline", c."id_number", c."mobile", c."email", c."bank_name", c."bank_account",
      c."bank_account_holder", c."manager_name", c."delivery_handler", c."contact_person", c."region", c."destination_province",
      c."mechanism", c."credit_type", c."contract_code", c."price_table", c."discount_percent", c."contact_address",
      c."receiver_han", c."address_han", c."phone_han", c."receiver_hcm", c."address_hcm", c."phone_hcm",
      c."receiver_dng", c."address_dng", c."phone_dng", c."created_at", c."updated_at",
      0::INTEGER AS "waybill_count"
    FROM "customers" c
    WHERE c."deleted_at" IS NULL
  `);

  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "orders" (
      "id" BIGSERIAL PRIMARY KEY,
      "order_code" character varying(64) NOT NULL UNIQUE,
      "ma_kh" character varying(128),
      "sender_name" character varying(255),
      "sender_phone" character varying(32),
      "sender_address" character varying(500),
      "receiver_name" character varying(255),
      "receiver_phone" character varying(32),
      "receiver_address" character varying(500),
      "origin_hub_id" BIGINT NOT NULL,
      "dest_hub_id" BIGINT NOT NULL,
      "package_count" integer NOT NULL DEFAULT 1,
      "weight" double precision NOT NULL DEFAULT 0,
      "payment_type" character varying(16) NOT NULL DEFAULT 'PP',
      "freight_amount" numeric(18,2) NOT NULL DEFAULT 0,
      "cod_amount" numeric(18,2) NOT NULL DEFAULT 0,
      "cc_amount" numeric(18,2) NOT NULL DEFAULT 0,
      "status" character varying(32) NOT NULL DEFAULT 'CONFIRMED',
      "note" character varying(500),
      "created_by" BIGINT,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP
    )
  `);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_orders_order_code" ON "orders" ("order_code")`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_orders_ma_kh" ON "orders" ("ma_kh")`);
};

const ensureAttendanceSchema = async (dataSource: DataSource) => {
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "attendance_locations" (
      "id" BIGSERIAL PRIMARY KEY,
      "name" VARCHAR(255) NOT NULL,
      "address" VARCHAR(500),
      "latitude" DOUBLE PRECISION NOT NULL,
      "longitude" DOUBLE PRECISION NOT NULL,
      "radius_meters" INTEGER NOT NULL DEFAULT 100,
      "is_active" BOOLEAN NOT NULL DEFAULT true,
      "created_by" BIGINT,
      "created_at" TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "idx_attendance_locations_active" ON "attendance_locations"("is_active")`);

  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "attendance_logs" (
      "id" BIGSERIAL PRIMARY KEY,
      "user_id" BIGINT NOT NULL,
      "location_id" BIGINT,
      "type" VARCHAR(16) NOT NULL CHECK ("type" IN ('check_in', 'check_out')),
      "user_latitude" DOUBLE PRECISION NOT NULL,
      "user_longitude" DOUBLE PRECISION NOT NULL,
      "accuracy" DOUBLE PRECISION,
      "distance_meters" DOUBLE PRECISION,
      "status" VARCHAR(16) NOT NULL CHECK ("status" IN ('success', 'failed')),
      "work_date" DATE NOT NULL DEFAULT CURRENT_DATE,
      "accuracy_warning" BOOLEAN NOT NULL DEFAULT false,
      "failure_reason" VARCHAR(500),
      "device_info" VARCHAR(1000),
      "created_at" TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "idx_attendance_logs_user_created" ON "attendance_logs"("user_id", "created_at" DESC)`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "idx_attendance_logs_location_created" ON "attendance_logs"("location_id", "created_at" DESC)`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "idx_attendance_logs_status_created" ON "attendance_logs"("status", "created_at" DESC)`);
};

const ensureDeliveryRoutesAndSplitsSchema = async (dataSource: DataSource) => {
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "delivery_routes" (
      "id" BIGSERIAL NOT NULL PRIMARY KEY,
      "code" character varying(64) NOT NULL UNIQUE,
      "name" character varying(255) NOT NULL,
      "hub_id" bigint,
      "province" character varying(128),
      "district" character varying(128),
      "description" character varying(500),
      "status" character varying(32) NOT NULL DEFAULT 'ACTIVE',
      "sort_order" integer NOT NULL DEFAULT 0,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "idx_delivery_routes_status_sort" ON "delivery_routes" ("status", "sort_order", "code")`);

  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "waybill_splits" (
      "id" BIGSERIAL NOT NULL PRIMARY KEY,
      "waybill_id" BIGINT NOT NULL,
      "trip_id" BIGINT NOT NULL,
      "loaded_package_count" integer NOT NULL DEFAULT 0,
      "loaded_weight" double precision NOT NULL DEFAULT 0,
      "loaded_cbm" double precision NOT NULL DEFAULT 0,
      "load_order" integer NOT NULL DEFAULT 0,
      "note" character varying(500),
      "load_status" character varying(32) NOT NULL DEFAULT 'LOADED',
      "expected_arrival_time" TIMESTAMP,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_waybill_splits_waybill_id" ON "waybill_splits" ("waybill_id")`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_waybill_splits_trip_id" ON "waybill_splits" ("trip_id")`);
};

const ensureWaybillChangeLogsSchema = async (dataSource: DataSource) => {
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "waybill_change_logs" (
      "id" BIGSERIAL PRIMARY KEY,
      "waybill_id" BIGINT NOT NULL,
      "action" VARCHAR(32) NOT NULL,
      "changes" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "changed_by_id" BIGINT,
      "changed_by_name" VARCHAR(255),
      "created_at" TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await dataSource.query(`
    CREATE INDEX IF NOT EXISTS "IDX_waybill_change_logs_waybill_created"
    ON "waybill_change_logs" ("waybill_id", "created_at" DESC)
  `);
};

const ensureVendorsSchema = async (dataSource: DataSource) => {
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "vendors" (
      "id" BIGSERIAL PRIMARY KEY,
      "code" character varying(64) NOT NULL UNIQUE,
      "name" character varying(255) NOT NULL,
      "phone" character varying(32),
      "address" character varying(500),
      "tax_code" character varying(32),
      "bank_account" character varying(64),
      "bank_name" character varying(255),
      "contact_person" character varying(255),
      "is_active" boolean NOT NULL DEFAULT true,
      "note" character varying(500),
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    )
  `);

  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "vendor_debt_entries" (
      "id" BIGSERIAL PRIMARY KEY,
      "vendor_id" BIGINT NOT NULL,
      "trip_id" BIGINT,
      "entry_date" DATE NOT NULL,
      "entry_type" character varying(32) NOT NULL,
      "amount" numeric(14,2) NOT NULL DEFAULT 0,
      "note" character varying(500),
      "created_by" BIGINT,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    )
  `);

  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "vendor_payments" (
      "id" BIGSERIAL PRIMARY KEY,
      "vendor_id" BIGINT NOT NULL,
      "trip_id" BIGINT,
      "amount" numeric(14,2) NOT NULL DEFAULT 0,
      "payment_date" DATE NOT NULL,
      "payment_method" character varying(32) NOT NULL DEFAULT 'BANK_TRANSFER',
      "note" character varying(500),
      "proof_url" character varying(1000),
      "created_by" BIGINT,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
};

const ensureCodCashFundSchema = async (dataSource: DataSource) => {
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "cash_funds" (
      "id" BIGSERIAL PRIMARY KEY,
      "code" varchar(32) NOT NULL,
      "name" varchar(255) NOT NULL,
      "hub_id" bigint NULL,
      "is_active" boolean NOT NULL DEFAULT true,
      "note" varchar(500) NULL,
      "created_by" bigint NULL,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    )
  `);
  await dataSource.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cash_funds_code" ON "cash_funds" (UPPER("code"))`);
  await dataSource.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "cod_fund_id" bigint NULL`);
  await dataSource.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "cod_collected_amount" numeric(14,2) NOT NULL DEFAULT 0`);
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "waybill_cash_vouchers" (
      "id" BIGSERIAL PRIMARY KEY,
      "waybill_id" bigint NOT NULL,
      "voucher_type" varchar(32) NOT NULL,
      "source_type" varchar(32) NOT NULL DEFAULT 'MANUAL',
      "fund_id" bigint NULL,
      "amount" numeric(14,2) NOT NULL DEFAULT 0,
      "note" varchar(500) NULL,
      "created_by" bigint NULL,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    )
  `);
  await dataSource.query(`ALTER TABLE "waybill_cash_vouchers" ADD COLUMN IF NOT EXISTS "source_type" varchar(32) NOT NULL DEFAULT 'MANUAL'`);
  await dataSource.query(`ALTER TABLE "waybill_cash_vouchers" ADD COLUMN IF NOT EXISTS "fund_id" bigint NULL`);
  await dataSource.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_cash_funds_hub') THEN
        ALTER TABLE "cash_funds" ADD CONSTRAINT "FK_cash_funds_hub" FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_cash_funds_created_by') THEN
        ALTER TABLE "cash_funds" ADD CONSTRAINT "FK_cash_funds_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_waybills_cod_fund') THEN
        ALTER TABLE "waybills" ADD CONSTRAINT "FK_waybills_cod_fund" FOREIGN KEY ("cod_fund_id") REFERENCES "cash_funds"("id") ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_waybill_cash_vouchers_fund') THEN
        ALTER TABLE "waybill_cash_vouchers" ADD CONSTRAINT "FK_waybill_cash_vouchers_fund" FOREIGN KEY ("fund_id") REFERENCES "cash_funds"("id") ON DELETE SET NULL;
      END IF;
    END $$
  `);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_waybills_cod_fund_id" ON "waybills" ("cod_fund_id") WHERE "cod_reconciled_at" IS NOT NULL`);
  await dataSource.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_waybill_cod_collection_voucher" ON "waybill_cash_vouchers" ("waybill_id") WHERE "source_type" = 'COD_COLLECTION'`);
  await dataSource.query(`
    UPDATE "waybills"
    SET "cod_reconciled_at" = NULL,
        "cod_reconciled_by" = NULL,
        "cod_collected_amount" = 0
    WHERE "cod_reconciled_at" IS NOT NULL AND "cod_fund_id" IS NULL
  `);
};

const ensureDashboardKpisSchema = async (dataSource: DataSource) => {
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "dashboard_kpis" (
      "id" BIGSERIAL PRIMARY KEY,
      "kpi_date" DATE NOT NULL,
      "hub_id" BIGINT NULL,
      "metric_key" VARCHAR(64) NOT NULL,
      "metric_value" NUMERIC(18, 2) NOT NULL DEFAULT 0,
      "created_at" TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
};

const baselineLegacyDatabase = async (dataSource: DataSource): Promise<boolean> => {
  const [{ waybills_exists: waybillsExists }] = await dataSource.query(
    `SELECT to_regclass('public.waybills') IS NOT NULL AS waybills_exists`,
  );
  if (!waybillsExists) return false;

  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "migrations" (
      "id" SERIAL NOT NULL,
      "timestamp" bigint NOT NULL,
      "name" character varying NOT NULL,
      CONSTRAINT "PK_migrations_id" PRIMARY KEY ("id")
    )
  `);
  const [{ count }] = await dataSource.query(`SELECT COUNT(*)::int AS count FROM "migrations"`);
  if (Number(count) > 0) return false;

  // Production existed before TypeORM migration tracking was enabled. Mark the
  // already deployed schema as the baseline so non-idempotent initial migrations
  // are not replayed against live tables.
  for (const migration of dataSource.migrations) {
    const name = migration.name || migration.constructor.name;
    const timestampMatch = name.match(/(\d{13})$/);
    if (!timestampMatch) throw new Error(`Migration name has no timestamp: ${name}`);
    await dataSource.query(
      `INSERT INTO "migrations" ("timestamp", "name") VALUES ($1, $2)`,
      [timestampMatch[1], name],
    );
  }
  console.log(`[migrations] Baselined legacy database with ${dataSource.migrations.length} migrations.`);
  return true;
};

async function main() {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    throw new Error(
      'Missing database URL. Set SUPABASE_POOLER_DATABASE_URL, DATABASE_POOLER_URL, or DATABASE_URL.',
    );
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    ssl: { rejectUnauthorized: false },
    extra: {
      max: 1,
      connectionTimeoutMillis: getPositiveInteger(
        process.env.DB_CONNECTION_TIMEOUT_MS,
        10_000,
      ),
      idleTimeoutMillis: 5_000,
      allowExitOnIdle: true,
    },
    migrations: [join(__dirname, '..', 'migrations', '*.js')],
    synchronize: false,
  });

  try {
    await dataSource.initialize();
    const wasBaselined = await baselineLegacyDatabase(dataSource);
    await ensureDeliveryWorkflowSchema(dataSource);
    await ensureHubScheduleSchema(dataSource);
    await ensureCustomerOpeningDebtSchema(dataSource);
    await ensureCodCashFundSchema(dataSource);
    await ensureFundBalancesSchema(dataSource);
    await ensureBusinessTablesSchema(dataSource);
    await ensureOrdersAndCustomersSchema(dataSource);
    await ensureAttendanceSchema(dataSource);
    await ensureDeliveryRoutesAndSplitsSchema(dataSource);
    await ensureWaybillChangeLogsSchema(dataSource);
    await ensureVendorsSchema(dataSource);
    await ensureDashboardKpisSchema(dataSource);

    if (wasBaselined) return;
    const executed = await dataSource.runMigrations({ transaction: 'each' });

    if (executed.length === 0) {
      console.log('[migrations] Database schema is already up to date.');
    } else {
      for (const migration of executed) {
        console.log(`[migrations] Executed ${migration.name}`);
      }
    }
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

main().catch((error) => {
  console.error('[migrations] Failed:', error);
  process.exitCode = 1;
});
