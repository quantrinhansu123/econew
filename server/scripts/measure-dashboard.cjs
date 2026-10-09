// Run with pnpm exec node -r ts-node/register scripts/measure-dashboard.cjs.
// Measures SELECT queries in a read-only transaction. Output contains aggregates.
require('reflect-metadata');
const { performance } = require('node:perf_hooks');
const { mkdirSync, writeFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const dataSource = require('../src/data-source').default;
const { DashboardService } = require('../src/dashboard/dashboard.service');
const entities = [
  require('../src/waybills/waybill.entity').WaybillEntity,
  require('../src/trips/trip.entity').TripEntity,
  require('../src/manifests/manifest.entity').ManifestEntity,
  require('../src/hubs/hub.entity').HubEntity,
  require('../src/trucks/truck.entity').TruckEntity,
  require('../src/reconciliations/reconciliation.entity').ReconciliationEntity,
  require('../src/expenses/expense.entity').ExpenseEntity,
];
let queryCount = 0;
dataSource.setOptions({ logging: ['query'], logger: {
  logQuery() { queryCount++; }, logQueryError() {}, logQuerySlow() {},
  logSchemaBuild() {}, logMigration() {}, log() {},
}});
(async () => {
  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction('REPEATABLE READ');
  await runner.query('SET TRANSACTION READ ONLY');
  try {
    const service = new DashboardService(...entities.map((entity) => runner.manager.getRepository(entity)));
    const results = {};
    for (const method of ['getKpiSummary', 'getHubPerformance']) {
      queryCount = 0;
      const start = performance.now();
      const result = await service[method]({
        date_from: new Date(process.argv[3] || '2026-09-01'),
        date_to: new Date(process.argv[4] || '2026-09-30'),
      }, { id: '0', role_mask: 64, hub_id: null });
      results[method] = { queries: queryCount, durationMs: Math.round(performance.now() - start), hubs: Array.isArray(result) ? result.length : undefined, result };
      console.log(JSON.stringify({ method, queries: queryCount, durationMs: results[method].durationMs, hubs: results[method].hubs }));
    }
    const output = resolve(process.argv[2] || '.tmp/dashboard-report.json');
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(results, null, 2));
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await dataSource.destroy();
  }
})().catch((error) => { console.error(error.name, error.code || 'benchmark-failed'); process.exitCode = 1; });
