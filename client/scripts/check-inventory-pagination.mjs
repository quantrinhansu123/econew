// Run against `pnpm dev`: pnpm exec node scripts/check-inventory-pagination.mjs
// All API traffic is intercepted; no real account or database is used.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import XLSX from 'xlsx';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const requests = [];
const errors = [];
let total = 10000;
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => {
  localStorage.setItem('eco_access_token', 'test-only');
  localStorage.setItem('eco_refresh_token', 'test-only');
  localStorage.setItem('eco_user_profile', JSON.stringify({ id: '1', username: 'test', role_mask: 64, hub_id: '1' }));
});
await page.route('**/api/v1/**', async (route) => {
  const url = new URL(route.request().url());
  let body = [];
  if (url.pathname.endsWith('/auth/refresh')) body = { access_token: 'test-only' };
  if (url.pathname.endsWith('/waybills/inventory/trip-lines')) {
    requests.push(url);
    const pageNumber = Number(url.searchParams.get('page'));
    const limit = Number(url.searchParams.get('limit'));
    const keyword = url.searchParams.get('keyword');
    const count = keyword ? 1 : total;
    const start = (pageNumber - 1) * limit;
    body = {
      items: Array.from({ length: Math.max(0, Math.min(limit, count - start)) }, (_, i) => ({
        id: String(start + i + 1), waybill_code: keyword || `TEST-${start + i + 1}`,
        current_state: 'IN_WAREHOUSE', sent_date: '2026-09-09', created_at: '2026-09-09T00:00:00Z',
        package_count: 1, remaining_packages: 1, weight: 2, freight_amount: 1000, ma_kh: 'TEST',
      })),
      meta: { total_waybills: count, total_freight: count * 1000, page: pageNumber, limit },
    };
  }
  await route.fulfill({ json: body });
});

try {
  await page.goto(process.env.INVENTORY_TEST_URL || 'http://127.0.0.1:6060/warehouse/orders');
  await page.getByText('Trang 1/400', { exact: false }).waitFor();
  assert.equal(requests.length, 1, 'opening 10,000 orders must request only one page');
  assert.equal(requests[0].searchParams.get('limit'), '25');
  assert.equal(requests[0].searchParams.get('sort_by'), 'sent_date');
  assert.equal(await page.locator('tbody tr.group').count(), 25);
  const nextPage = page.waitForResponse((response) => response.url().includes('/waybills/inventory/trip-lines?') && new URL(response.url()).searchParams.get('page') === '2');
  await page.getByRole('button', { name: 'Sau', exact: true }).click();
  await nextPage;
  await page.getByText('TEST-26', { exact: true }).first().waitFor();
  await page.getByText('Trang 2/400', { exact: false }).waitFor();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].searchParams.get('page'), '2');

  // Export still requests every page, even while the visible table is paged.
  total = 250;
  requests.length = 0;
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải Excel', exact: false }).click();
  const exportedFile = await download;
  const workbook = XLSX.readFile(await exportedFile.path());
  const exportedRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
  const exportedCodes = exportedRows.flat().filter((value) => /^TEST-?\d+$/.test(String(value)));
  assert.equal(new Set(exportedCodes).size, 250, 'Excel must contain all 250 orders');
  assert.deepEqual(requests.map((url) => Number(url.searchParams.get('page'))).sort(), [1, 2, 3]);
  assert(requests.every((url) => url.searchParams.get('limit') === '100'));

  // Column filters retain a full snapshot, but only a single page is rendered.
  requests.length = 0;
  const advancedLoaded = page.waitForResponse((response) => response.url().includes('/waybills/inventory/trip-lines?') && new URL(response.url()).searchParams.get('page') === '3');
  await page.locator('[aria-label^="Lọc hoặc sắp xếp theo"]').first().click();
  await advancedLoaded;
  await page.getByText('Trang 1/10', { exact: false }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(requests.length, 3);
  assert.equal(await page.locator('tbody tr.group').count(), 25);
  await page.getByRole('button', { name: 'Sau', exact: true }).click();
  await page.getByText('Trang 2/10', { exact: false }).waitFor();
  assert.equal(requests.length, 3, 'paging an advanced snapshot must not reload it');

  requests.length = 0;
  const popupReady = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'In danh sách tồn', exact: true }).click();
  const popup = await popupReady;
  await popup.waitForURL('**/print/inventory-stock');
  assert.equal(requests.length, 3, 'printing must load every page');
  await popup.close();

  // Filters are sent to the backend and reset the selected page.
  requests.length = 0;
  const keywordInput = page.locator('input[placeholder]').filter({ visible: true }).first();
  const searched = page.waitForResponse((response) => response.url().includes('/waybills/inventory/trip-lines?') && new URL(response.url()).searchParams.get('keyword') === 'TEST-9999');
  await keywordInput.fill('TEST-9999');
  await searched;
  await page.getByText(/Trang 1\/1$/).waitFor();
  assert.equal(requests.at(-1).searchParams.get('keyword'), 'TEST-9999');
  assert.equal(requests.at(-1).searchParams.get('page'), '1');
  await page.goto('http://127.0.0.1:6060/warehouse/inventory');
  await page.getByText(/Trang 1\/25$/).waitFor();
  await page.locator('tbody tr.group input[type="checkbox"]').first().check();
  await page.getByRole('button', { name: 'Sau', exact: true }).click();
  await page.getByText('TEST-11', { exact: true }).first().waitFor();
  assert.equal(await page.locator('tbody tr.group input[type="checkbox"]').first().isChecked(), false);
  await page.getByRole('button', { name: 'Trước', exact: true }).click();
  await page.getByText('TEST-1', { exact: true }).first().waitFor();
  assert.equal(await page.locator('tbody tr.group input[type="checkbox"]').first().isChecked(), true, 'selection must survive changing pages');
  assert.deepEqual(errors, []);
  console.log('PASS: 10,000-order initial load, next page, 250-order Excel, advanced filters, full print, backend search, no browser errors');
} finally {
  await browser.close();
}
