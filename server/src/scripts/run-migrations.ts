import 'reflect-metadata';
import 'dotenv/config';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { getDatabaseUrl } from '../database-url';

const getPositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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
