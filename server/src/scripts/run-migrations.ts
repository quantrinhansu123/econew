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

const ensureVendorPaymentProfileSchema = async (dataSource: DataSource) => {
  await dataSource.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "opening_debt" numeric(18,2) NOT NULL DEFAULT 0`);
  await dataSource.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "bank_name" varchar(255)`);
  await dataSource.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "bank_account" varchar(64)`);
  await dataSource.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "bank_account_holder" varchar(255)`);
  await dataSource.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "qr_image_url" varchar(1000)`);
};

const ensureInternalFleetAndPayrollSchema = async (dataSource: DataSource) => {
  await dataSource.query(`ALTER TABLE "trucks" ADD COLUMN IF NOT EXISTS "ownership_type" varchar(16) NOT NULL DEFAULT 'VENDOR'`);
  await dataSource.query(`ALTER TABLE "trucks" ADD COLUMN IF NOT EXISTS "hub_id" bigint NULL`);
  await dataSource.query(`UPDATE "trucks" SET "driver_id" = NULL, "ten_lai_xe" = NULL, "vendor_id" = NULL, "nha_xe" = NULL WHERE "ownership_type" = 'INTERNAL'`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_trucks_ownership_type" ON "trucks" ("ownership_type")`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_trucks_hub_id" ON "trucks" ("hub_id")`);
  await dataSource.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_trucks_hub') THEN
        ALTER TABLE "trucks" ADD CONSTRAINT "FK_trucks_hub" FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE SET NULL;
      END IF;
    END $$
  `);
  await dataSource.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "monthly_salary" numeric(14,2) NOT NULL DEFAULT 0`);
};

const ensurePartnerFleetDirectory = async (dataSource: DataSource) => {
  await dataSource.query(`
    INSERT INTO "vendors" ("code", "name", "status", "payable_balance")
    SELECT 'CONG_LE', 'Công lẻ', 'ACTIVE', 0
    WHERE NOT EXISTS (SELECT 1 FROM "vendors" WHERE "code" = 'CONG_LE' OR "name" = 'Công lẻ')
  `);
  await dataSource.query(`
    UPDATE "trucks" truck
    SET "vendor_id" = recent."vendor_id",
        "nha_xe" = COALESCE(NULLIF(TRIM(truck."nha_xe"), ''), recent."vendor_name")
    FROM (
      SELECT DISTINCT ON (trip."truck_id")
        trip."truck_id", trip."vendor_id", vendor."name" AS "vendor_name", vendor."code" AS "vendor_code"
      FROM "trips" trip
      JOIN "vendors" vendor ON vendor."id" = trip."vendor_id"
      WHERE trip."truck_id" IS NOT NULL AND trip."vendor_id" IS NOT NULL
      ORDER BY trip."truck_id", trip."departure_time" DESC NULLS LAST, trip."id" DESC
    ) recent
    WHERE truck."id" = recent."truck_id"
      AND COALESCE(truck."ownership_type", 'VENDOR') <> 'INTERNAL'
      AND (
        truck."vendor_id" IS NULL
        OR (
          EXISTS (SELECT 1 FROM "vendors" current_vendor WHERE current_vendor."id" = truck."vendor_id" AND current_vendor."code" = 'CONG_LE')
          AND recent."vendor_code" <> 'CONG_LE'
        )
      )
  `);
  await dataSource.query(`
    UPDATE "trucks"
    SET "driver_id" = NULL, "ten_lai_xe" = NULL, "hub_id" = NULL
    WHERE COALESCE("ownership_type", 'VENDOR') = 'VENDOR'
  `);
  await dataSource.query(`
    UPDATE "trucks" truck
    SET "vendor_id" = manual."vendor_id", "nha_xe" = manual."vendor_name"
    FROM (
      SELECT DISTINCT ON (UPPER(TRIM(trip."manual_license_plate")))
        UPPER(TRIM(trip."manual_license_plate")) AS "plate",
        trip."vendor_id", vendor."name" AS "vendor_name"
      FROM "trips" trip
      JOIN "vendors" vendor ON vendor."id" = trip."vendor_id"
      WHERE NULLIF(TRIM(trip."manual_license_plate"), '') IS NOT NULL AND trip."vendor_id" IS NOT NULL
      ORDER BY UPPER(TRIM(trip."manual_license_plate")), trip."departure_time" DESC NULLS LAST, trip."id" DESC
    ) manual
    WHERE UPPER(TRIM(truck."license_plate")) = manual."plate"
      AND COALESCE(truck."ownership_type", 'VENDOR') = 'VENDOR'
      AND (
        truck."vendor_id" IS NULL
        OR EXISTS (SELECT 1 FROM "vendors" current_vendor WHERE current_vendor."id" = truck."vendor_id" AND current_vendor."code" = 'CONG_LE')
      )
  `);
  await dataSource.query(`
    UPDATE "trucks" truck
    SET "vendor_id" = default_vendor."id",
        "nha_xe" = COALESCE(NULLIF(TRIM(truck."nha_xe"), ''), default_vendor."name")
    FROM "vendors" default_vendor
    WHERE COALESCE(truck."ownership_type", 'VENDOR') <> 'INTERNAL'
      AND truck."vendor_id" IS NULL
      AND (default_vendor."code" = 'CONG_LE' OR default_vendor."name" = 'Công lẻ')
  `);
  await dataSource.query(`
    INSERT INTO "trucks" ("license_plate", "bks", "payload", "fuel_consumption_limit", "status", "ownership_type", "vendor_id", "nha_xe", "loai_xe")
    SELECT manual."plate", manual."plate", 1, 0, 'AVAILABLE', 'VENDOR', manual."vendor_id", vendor."name", 'ĐỐI TÁC'
    FROM (
      SELECT DISTINCT ON (UPPER(TRIM(trip."manual_license_plate")))
        UPPER(TRIM(trip."manual_license_plate")) AS "plate",
        COALESCE(trip."vendor_id", (SELECT "id" FROM "vendors" WHERE "code" = 'CONG_LE' OR "name" = 'Công lẻ' ORDER BY "id" LIMIT 1)) AS "vendor_id"
      FROM "trips" trip
      WHERE NULLIF(TRIM(trip."manual_license_plate"), '') IS NOT NULL
      ORDER BY UPPER(TRIM(trip."manual_license_plate")), CASE WHEN trip."vendor_id" IS NULL THEN 1 ELSE 0 END, trip."departure_time" DESC NULLS LAST, trip."id" DESC
    ) manual
    JOIN "vendors" vendor ON vendor."id" = manual."vendor_id"
    WHERE NOT EXISTS (SELECT 1 FROM "trucks" existing WHERE UPPER(TRIM(existing."license_plate")) = manual."plate")
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

const ensureUniversalCashJournalSchema = async (dataSource: DataSource) => {
  await dataSource.query(`ALTER TABLE "cash_journal_entries" ADD COLUMN IF NOT EXISTS "fund_id" bigint`);
  await dataSource.query(`ALTER TABLE "cash_journal_entries" ADD COLUMN IF NOT EXISTS "vendor_id" bigint`);
  await dataSource.query(`ALTER TABLE "cash_journal_entries" ADD COLUMN IF NOT EXISTS "hub_id" bigint`);
  await dataSource.query(`ALTER TABLE "cash_journal_entries" ADD COLUMN IF NOT EXISTS "created_by_id" bigint`);
  await dataSource.query(`ALTER TABLE "cash_journal_entries" ADD COLUMN IF NOT EXISTS "created_by_name" varchar(255)`);
  await dataSource.query(`ALTER TABLE "vendor_payments" ADD COLUMN IF NOT EXISTS "fund_id" bigint`);
  await dataSource.query(`ALTER TABLE "vendor_payments" ADD COLUMN IF NOT EXISTS "cost_category" varchar(255)`);
  await dataSource.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_cash_journal_fund') THEN
        ALTER TABLE "cash_journal_entries" ADD CONSTRAINT "FK_cash_journal_fund" FOREIGN KEY ("fund_id") REFERENCES "cash_funds"("id") ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_cash_journal_vendor') THEN
        ALTER TABLE "cash_journal_entries" ADD CONSTRAINT "FK_cash_journal_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_cash_journal_hub') THEN
        ALTER TABLE "cash_journal_entries" ADD CONSTRAINT "FK_cash_journal_hub" FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_cash_journal_creator') THEN
        ALTER TABLE "cash_journal_entries" ADD CONSTRAINT "FK_cash_journal_creator" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_vendor_payments_fund') THEN
        ALTER TABLE "vendor_payments" ADD CONSTRAINT "FK_vendor_payments_fund" FOREIGN KEY ("fund_id") REFERENCES "cash_funds"("id") ON DELETE SET NULL;
      END IF;
    END $$
  `);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_cash_journal_fund_date" ON "cash_journal_entries" ("fund_id", "entry_date" DESC)`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_cash_journal_vendor" ON "cash_journal_entries" ("vendor_id")`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_cash_journal_hub_date" ON "cash_journal_entries" ("hub_id", "entry_date" DESC)`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_payments_fund" ON "vendor_payments" ("fund_id")`);
  await dataSource.query(`
    UPDATE "cash_journal_entries" journal
    SET "hub_id" = fund."hub_id"
    FROM "cash_funds" fund
    WHERE journal."fund_id" = fund."id"
      AND journal."hub_id" IS NULL
      AND fund."hub_id" IS NOT NULL
  `);
};

const ensureExpenseReceiptSchema = async (dataSource: DataSource) => {
  await dataSource.query(`ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "fund_id" bigint`);
  await dataSource.query(`ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "receipt_urls" jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await dataSource.query(`ALTER TABLE "cash_journal_entries" ADD COLUMN IF NOT EXISTS "attachment_urls" jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await dataSource.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_expenses_fund') THEN
        ALTER TABLE "expenses" ADD CONSTRAINT "FK_expenses_fund" FOREIGN KEY ("fund_id") REFERENCES "cash_funds"("id") ON DELETE SET NULL;
      END IF;
    END $$
  `);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_expenses_fund_created" ON "expenses" ("fund_id", "created_at" DESC)`);
};

const ensureExpenseCategorySchema = async (dataSource: DataSource) => {
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "expense_categories" (
      "id" BIGSERIAL PRIMARY KEY,
      "name" varchar(100) NOT NULL,
      "description" varchar(500),
      "is_active" boolean NOT NULL DEFAULT true,
      "sort_order" integer NOT NULL DEFAULT 0,
      "created_by" bigint,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    )
  `);
  await dataSource.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_expense_categories_name" ON "expense_categories" (LOWER("name"))`);
  await dataSource.query(`
    INSERT INTO "expense_categories" ("name", "sort_order")
    SELECT item.name, item.sort_order
    FROM (VALUES
      ('FUEL', 10), ('TOLL', 20), ('PARKING', 30), ('LOADING_UNLOADING', 40),
      ('EN_ROUTE_DROP', 50), ('WAREHOUSE', 60), ('HCM_WAREHOUSE', 70),
      ('REPAIR', 80), ('DRIVER_ALLOWANCE', 90), ('OTHER', 999)
    ) AS item(name, sort_order)
    ON CONFLICT (LOWER("name")) DO NOTHING
  `);
  await dataSource.query(`
    INSERT INTO "expense_categories" ("name", "sort_order")
    SELECT DISTINCT TRIM(value), 500
    FROM (
      SELECT category AS value FROM expenses WHERE category IS NOT NULL
      UNION ALL
      SELECT cost_category AS value FROM cash_journal_entries WHERE voucher_type = 'Chi' AND cost_category IS NOT NULL
      UNION ALL
      SELECT cost_category AS value FROM vendor_payments WHERE cost_category IS NOT NULL
    ) existing
    WHERE NULLIF(TRIM(value), '') IS NOT NULL
    ON CONFLICT (LOWER("name")) DO NOTHING
  `);
};

const ensureStaffDirectorySchema = async (dataSource: DataSource) => {
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "staff_departments" (
      "id" BIGSERIAL PRIMARY KEY, "code" varchar(32) NOT NULL, "name" varchar(120) NOT NULL,
      "is_active" boolean NOT NULL DEFAULT true, "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    )
  `);
  await dataSource.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_staff_departments_code" ON "staff_departments" (UPPER("code"))`);
  await dataSource.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_staff_departments_name" ON "staff_departments" (LOWER("name"))`);
  await dataSource.query(`INSERT INTO "staff_departments" ("code", "name") VALUES ('LAI_XE', 'Lái xe'), ('KE_TOAN', 'Kế toán'), ('BOC_XEP', 'Bốc xếp'), ('KHO', 'Kho'), ('DIEU_PHOI', 'Điều phối'), ('VAN_PHONG', 'Văn phòng') ON CONFLICT DO NOTHING`);
  await dataSource.query(`
    INSERT INTO "staff_departments" ("code", "name")
    SELECT 'BP_' || id::text, name
    FROM (
      SELECT MIN(id) AS id, MIN(TRIM(department)) AS name
      FROM staff_members
      WHERE NULLIF(TRIM(department), '') IS NOT NULL
      GROUP BY LOWER(TRIM(department))
    ) legacy
    ON CONFLICT DO NOTHING
  `);
  await dataSource.query(`ALTER TABLE "staff_members" ALTER COLUMN "password_hash" DROP NOT NULL`);
  await dataSource.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "employee_code" varchar(32)`);
  await dataSource.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "department_id" bigint`);
  await dataSource.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "email" varchar(255)`);
  await dataSource.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "identity_number" varchar(32)`);
  await dataSource.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "address" varchar(500)`);
  await dataSource.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "hire_date" date`);
  await dataSource.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "employment_status" varchar(16) NOT NULL DEFAULT 'ACTIVE'`);
  await dataSource.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "hub_id" bigint`);
  await dataSource.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "user_id" bigint`);
  await dataSource.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "base_salary" numeric(14,2) NOT NULL DEFAULT 0`);
  await dataSource.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "meal_allowance" numeric(14,2) NOT NULL DEFAULT 0`);
  await dataSource.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "transport_allowance" numeric(14,2) NOT NULL DEFAULT 0`);
  await dataSource.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "other_allowance" numeric(14,2) NOT NULL DEFAULT 0`);
  await dataSource.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "overtime_hourly_rate" numeric(14,2) NOT NULL DEFAULT 0`);
  await dataSource.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "standard_work_days" numeric(5,2) NOT NULL DEFAULT 26`);
  await dataSource.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "note" varchar(1000)`);
  await dataSource.query(`UPDATE "staff_members" SET "employee_code" = 'NV' || LPAD(id::text, 5, '0') WHERE NULLIF(TRIM("employee_code"), '') IS NULL`);
  await dataSource.query(`
    UPDATE "staff_members" staff
    SET "department_id" = department.id
    FROM "staff_departments" department
    WHERE staff."department_id" IS NULL AND LOWER(TRIM(staff."department")) = LOWER(department."name")
  `);
  await dataSource.query(`ALTER TABLE "staff_members" ALTER COLUMN "employee_code" SET NOT NULL`);
  await dataSource.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_staff_members_employee_code" ON "staff_members" (UPPER("employee_code"))`);
  await dataSource.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_staff_members_user_id" ON "staff_members" ("user_id") WHERE "user_id" IS NOT NULL`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_staff_members_department" ON "staff_members" ("department_id")`);
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "staff_attendance_records" (
      "id" BIGSERIAL PRIMARY KEY, "staff_member_id" bigint NOT NULL, "work_date" date NOT NULL,
      "work_days" numeric(4,2) NOT NULL DEFAULT 0, "overtime_hours" numeric(6,2) NOT NULL DEFAULT 0,
      "note" varchar(500), "created_by" bigint, "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    )
  `);
  await dataSource.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_staff_attendance_day" ON "staff_attendance_records" ("staff_member_id", "work_date")`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_staff_attendance_month" ON "staff_attendance_records" ("work_date", "staff_member_id")`);
  await dataSource.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_staff_members_department') THEN ALTER TABLE "staff_members" ADD CONSTRAINT "FK_staff_members_department" FOREIGN KEY ("department_id") REFERENCES "staff_departments"("id") ON DELETE SET NULL; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_staff_members_hub') THEN ALTER TABLE "staff_members" ADD CONSTRAINT "FK_staff_members_hub" FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE SET NULL; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_staff_members_user') THEN ALTER TABLE "staff_members" ADD CONSTRAINT "FK_staff_members_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_staff_attendance_member') THEN ALTER TABLE "staff_attendance_records" ADD CONSTRAINT "FK_staff_attendance_member" FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE CASCADE; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_staff_attendance_creator') THEN ALTER TABLE "staff_attendance_records" ADD CONSTRAINT "FK_staff_attendance_creator" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL; END IF;
    END $$
  `);
};

const ensureSalaryAdvanceSchema = async (dataSource: DataSource) => {
  await dataSource.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "opening_salary_debt" numeric(14,2) NOT NULL DEFAULT 0`);
  await dataSource.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "dimension_file_url" varchar(1000)`);
  await dataSource.query(`ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "dimension_file_name" varchar(255)`);
  await dataSource.query(`CREATE TABLE IF NOT EXISTS "staff_payroll_adjustments" ("id" bigserial PRIMARY KEY, "staff_member_id" bigint NOT NULL REFERENCES "staff_members"("id") ON DELETE CASCADE, "payroll_month" varchar(7) NOT NULL, "reward_amount" numeric(14,2) NOT NULL DEFAULT 0, "note" varchar(1000), "updated_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "UQ_staff_payroll_adjustment_month" UNIQUE ("staff_member_id", "payroll_month"))`);
  await dataSource.query(`CREATE TABLE IF NOT EXISTS "salary_advances" ("id" bigserial PRIMARY KEY, "staff_member_id" bigint NOT NULL REFERENCES "staff_members"("id") ON DELETE RESTRICT, "advance_date" date NOT NULL, "amount" numeric(14,2) NOT NULL, "fund_id" bigint NOT NULL REFERENCES "cash_funds"("id") ON DELETE RESTRICT, "hub_id" bigint REFERENCES "hubs"("id") ON DELETE SET NULL, "note" varchar(1000), "cash_journal_entry_id" bigint NOT NULL REFERENCES "cash_journal_entries"("id") ON DELETE RESTRICT, "created_by" bigint REFERENCES "users"("id") ON DELETE SET NULL, "created_at" timestamp NOT NULL DEFAULT now())`);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_salary_advances_staff_date" ON "salary_advances" ("staff_member_id", "advance_date")`);
  await dataSource.query(`INSERT INTO "expense_categories" ("name", "description", "is_active", "sort_order") SELECT '334-Phải trả người lao động', 'Các khoản chi lương, tạm ứng lương', true, 5 WHERE NOT EXISTS (SELECT 1 FROM "expense_categories" WHERE LOWER("name") = LOWER('334-Phải trả người lao động'))`);
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
    await ensureVendorPaymentProfileSchema(dataSource);
    await ensureCodCashFundSchema(dataSource);
    await ensureUniversalCashJournalSchema(dataSource);
    await ensureExpenseReceiptSchema(dataSource);
    await ensureExpenseCategorySchema(dataSource);
    await ensureStaffDirectorySchema(dataSource);
    await ensureInternalFleetAndPayrollSchema(dataSource);
    await ensureSalaryAdvanceSchema(dataSource);
    await ensurePartnerFleetDirectory(dataSource);
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
