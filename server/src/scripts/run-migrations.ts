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
  await dataSource.query(`UPDATE "trucks" SET "ownership_type" = 'INTERNAL' WHERE UPPER(COALESCE("loai_xe", '')) IN ('NỘI BỘ', 'NOI BO') AND COALESCE("ownership_type", 'VENDOR') = 'VENDOR'`);
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
    await ensureInternalFleetAndPayrollSchema(dataSource);
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
