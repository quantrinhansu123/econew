// Use a production build from measure-bundle.mjs and `pnpm preview` on port 6060.
// All API traffic is intercepted. This checks loaded modules, not server latency.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const report = JSON.parse(readFileSync(process.argv[2] || '.tmp/bundle-after.json', 'utf8'));
const byName = new Map(report.chunks.map((chunk) => [chunk.name, chunk]));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const requestedScripts = new Set();
const errors = [];
const base = process.env.INVENTORY_TEST_URL || 'http://127.0.0.1:6060';
const hasModule = (pattern) => [...requestedScripts].some((name) => byName.get(name)?.modules.some((entry) => pattern.test(entry.id)));
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  const path = new URL(request.url()).pathname.replace(/^\//, '');
  if (path.endsWith('.js')) requestedScripts.add(path);
});
await page.route('**/api/v1/**', async (route) => {
  const path = new URL(route.request().url()).pathname;
  const customer = { id: '1', code: 'TEST', name: 'Khách kiểm thử', opening_debt: 0 };
  let body = [];
  if (path.endsWith('/hubs/active')) body = [{ id: '1', code: 'HAN', name: 'Hà Nội' }];
  if (path.endsWith('/waybills/next-code')) body = { waybill_code: 'SPEED-NEW' };
  if (path.endsWith('/waybills')) body = { items: [], meta: { total: 0 } };
  if (path.endsWith('/manifests/10')) body = {
    id: '10', manifest_code: 'SPEED-MANIFEST', origin_hub_id: '1', dest_hub_id: '1',
    waybills: [{ id: '1', waybill_code: 'SPEED-TEST', package_count: 1, loading_position: 1, payment_type: 'PP', origin_hub_id: '1', dest_hub_id: '1' }],
  };
  if (path.endsWith('/customers')) body = { items: [customer], meta: { total: 1 } };
  if (path.endsWith('/customers/1')) body = customer;
  if (path.endsWith('/waybills/cash-vouchers')) body = { items: [], meta: { total: 0 } };
  if (path.endsWith('/waybills/inventory/trip-lines')) body = {
    items: [{ id: '1', waybill_code: 'SPEED-TEST', ma_kh: 'TEST', package_count: 1, freight_amount: 1000, sent_date: '2026-08-01', current_state: 'IN_WAREHOUSE' }],
    meta: { total_waybills: 1, total_freight: 1000 },
  };
  await route.fulfill({ json: body });
});
try {
  await page.goto(`${base}/login`);
  await page.getByRole('button', { name: /Đăng nhập/ }).waitFor();
  assert(report.initial.bytes < 400000, 'initial JS must remain under 400 KB uncompressed');
  assert(!hasModule(/WarehouseManifestsPage|WarehouseManifestDetailPage|CustomerDetailDialog|\.pnpm\/xlsx/), 'login must not load warehouse dialogs or Excel');

  await page.evaluate(() => {
    localStorage.setItem('eco_access_token', 'test-only');
    localStorage.setItem('eco_user_profile', JSON.stringify({ id: '1', username: 'test', role_mask: 64, hub_id: '1' }));
  });
  await page.goto(`${base}/warehouse/orders`);
  await page.getByText('SPEED-TEST', { exact: true }).first().waitFor();
  assert(!hasModule(/CustomerDetailDialog|\.pnpm\/xlsx/), 'opening orders must defer customer finance and Excel');
  await page.getByRole('button', { name: 'Bảng kê KH', exact: true }).click();
  await page.getByTestId('customer-period-summary').waitFor();
  assert(hasModule(/CustomerDetailDialog/), 'customer finance must load on demand');
  assert(!hasModule(/\.pnpm\/xlsx/), 'opening finance must not load Excel');
  await page.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: /Tải Excel/ }).click();
  await downloaded;
  assert(hasModule(/\.pnpm\/xlsx/), 'Excel must load when the export is requested');

  requestedScripts.clear();
  await page.goto(`${base}/orders/new`);
  await page.getByRole('button', { name: /Nhập.*loạt/ }).waitFor();
  assert(!hasModule(/OrderBulkImportDialog|\.pnpm\/xlsx/), 'new order form must defer bulk import and Excel');
  await page.getByRole('button', { name: /Nhập.*loạt/ }).click();
  await page.getByRole('button', { name: 'Tải mẫu Excel', exact: true }).waitFor();
  assert(hasModule(/OrderBulkImportDialog/) && hasModule(/\.pnpm\/xlsx/), 'bulk import must load Excel on demand');
  const templateDownloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải mẫu Excel', exact: true }).click();
  await templateDownloaded;

  requestedScripts.clear();
  await page.goto(`${base}/print/manifest/10`);
  await page.getByRole('button', { name: 'In bảng kê', exact: true }).waitFor();
  assert(!hasModule(/\.pnpm\/xlsx/), 'manifest printing must defer Excel');
  const manifestDownloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải Excel', exact: true }).click();
  await manifestDownloaded;
  assert(hasModule(/\.pnpm\/xlsx/), 'manifest export must load Excel on demand');
  assert.deepEqual(errors, []);
  console.log(`PASS: ${report.initial.bytes} initial JS bytes; customer finance, bulk import and Excel load on demand; order/template/manifest exports work; no browser errors`);
} finally {
  await browser.close();
}
