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
