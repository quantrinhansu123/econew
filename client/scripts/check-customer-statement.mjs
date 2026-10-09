// Run against `pnpm dev --host 127.0.0.1 --port 6060`.
// API calls are intercepted; no real financial records are modified.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.INVENTORY_TEST_URL || 'http://127.0.0.1:6060';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', timezoneId: 'Asia/Ho_Chi_Minh' });
const errors = [];
const billRequests = [];
const voucherRequests = [];
const payments = [];
const freight = [2237500, 0, 867500, 522500, 1311200, 1550000, 735000, 891500];
const bills = Array.from({ length: 209 }, (_, index) => ({
  id: String(index + 1), waybill_code: index < 8 ? `AUG-${index + 1}` : `SEP-${index + 1}`,
  ma_kh: 'TANLB', sender_name: 'A Tân - LB', noi_dung: 'LB',
  sent_date: index < 8 ? `2026-08-${String(index + 1).padStart(2, '0')}` : '2026-09-15',
  created_at: '2026-10-01T00:00:00Z', received_at: '2026-10-01T00:00:00Z',
  freight_amount: freight[index] ?? 100000, customer_payment_due_amount: freight[index] ?? 100000,
  package_count: 1, current_state: 'DELIVERED', customer_payment_status: null, payment_type: 'PP',
}));
const vouchers = [
  { id: 'aug-payment', waybill_id: '1', waybill_code: 'AUG-1', voucher_type: 'Thu', source_type: 'MANUAL', amount: 1000000, created_at: '2026-10-09T00:00:00Z' },
  { id: 'sep-cod', waybill_id: '9', waybill_code: 'SEP-9', voucher_type: 'Thu', source_type: 'COD_COLLECTION', amount: 3920000, created_at: '2026-09-29T00:00:00Z' },
  ...Array.from({ length: 207 }, (_, index) => ({ id: `other-${index}`, waybill_id: '10', waybill_code: 'SEP-10', voucher_type: 'Thu', source_type: 'MANUAL', amount: 1, created_at: '2026-10-09T00:00:00Z' })),
];
const customer = { id: '1', code: 'TANLB', name: 'A Tân - LB', opening_debt: 5000000 };
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => {
  localStorage.setItem('eco_access_token', 'test-only');
  localStorage.setItem('eco_user_profile', JSON.stringify({ id: '1', username: 'test', role_mask: 64, hub_id: '1' }));
});
await page.route('**/api/v1/**', async (route) => {
  const url = new URL(route.request().url());
  let body = [];
  if (url.pathname.endsWith('/auth/refresh')) body = { access_token: 'test-only' };
  if (url.pathname.endsWith('/customers')) body = { items: [customer], meta: { total: 1 } };
  if (url.pathname.endsWith('/customers/1')) body = customer;
  if (url.pathname.endsWith('/finance/cash-funds')) body = [{ id: 'fund-1', name: 'Quỹ thử', is_active: true }];
  if (url.pathname.endsWith('/waybills/inventory/trip-lines')) {
    billRequests.push(url);
    const filtered = bills.filter((bill) => (!url.searchParams.get('sent_from') || bill.sent_date >= url.searchParams.get('sent_from'))
      && (!url.searchParams.get('sent_to') || bill.sent_date <= url.searchParams.get('sent_to'))
      && (!url.searchParams.get('keyword') || bill.noi_dung.includes(url.searchParams.get('keyword'))));
    const limit = Math.min(100, Number(url.searchParams.get('limit') || 20));
    const start = (Number(url.searchParams.get('page') || 1) - 1) * limit;
    body = { items: filtered.slice(start, start + limit), meta: { total_waybills: filtered.length, total_freight: filtered.reduce((sum, bill) => sum + bill.freight_amount, 0) } };
  }
  if (url.pathname.endsWith('/waybills/cash-vouchers')) {
    voucherRequests.push(url);
    const limit = Number(url.searchParams.get('limit') || 100);
    const start = (Number(url.searchParams.get('page') || 1) - 1) * limit;
    body = { items: vouchers.slice(start, start + limit), meta: { total: vouchers.length } };
  }
  if (url.pathname.endsWith('/waybills/cash-vouchers/bulk-payment')) {
    payments.push(route.request().postDataJSON());
    body = { items: [] };
  }
  await route.fulfill({ json: body });
});

const selectPeriodDate = async (label, date, direction = 'next') => {
  const field = page.locator('label').filter({ has: page.getByText(label, { exact: true }) });
  await field.getByRole('button').first().click();
  const target = page.locator(`[data-day="${date}"]`).first();
  for (let i = 0; i < 18 && !(await target.isVisible()); i++) await page.getByRole('button', {
    name: direction === 'next' ? /next month|tháng sau|tháng tiếp/i : /previous month|tháng trước/i,
  }).click();
  await target.click();
};

try {
  await page.goto(`${base}/warehouse/orders`);
  await page.getByText('AUG-1', { exact: true }).first().waitFor();
  await page.getByRole('textbox', { name: 'Tìm toàn bộ dữ liệu vận đơn' }).fill('LB');
  await page.getByRole('button', { name: 'Từ ngày - Đến ngày', exact: true }).click();
  for (let i = 0; i < 18 && !(await page.locator('[data-day="8/1/2026"]').first().isVisible()); i++) await page.locator('.rdp-button_previous').click();
  await page.locator('[data-day="8/1/2026"]').first().click();
  await page.locator('[data-day="8/31/2026"]').first().click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Bảng kê KH', exact: true }).click();
  const summary = page.getByTestId('customer-period-summary');
  await summary.getByText('8 đơn', { exact: true }).waitFor();
  assert.match(await summary.innerText(), /8\.115\.200/);
  assert.match(await summary.innerText(), /7\.115\.200/);
  assert(billRequests.filter((url) => url.searchParams.get('ma_kh') === 'TANLB').every((url) => url.searchParams.get('keyword') === 'LB'));
  assert.deepEqual(voucherRequests.map((url) => Number(url.searchParams.get('page'))).sort(), [1, 2, 3]);
  assert(billRequests.filter((url) => url.searchParams.get('ma_kh') === 'TANLB').every((url) => url.searchParams.get('limit') === '100'));

  await page.screenshot({ path: '.tmp/customer-period-desktop.png' });
  await page.getByRole('button', { name: 'In phiếu kê', exact: true }).click();
  const printed = page.locator('.statement-print-page');
  await printed.waitFor();
  assert.equal(await printed.locator('table').first().locator('tbody tr').count(), 8);
  assert.equal(await printed.locator('table').nth(1).locator('tbody tr').count(), 1);
  assert(!/SEP-/.test(await printed.innerText()));
  assert.match(await printed.innerText(), /8\.115\.200/);
  await page.locator('.statement-print-shell').getByRole('button').last().click();

  await page.getByRole('button', { name: 'Thanh toán', exact: true }).last().click();
  await page.getByRole('button', { name: 'Chọn tất cả', exact: true }).click();
  assert.equal(await page.locator('input[type="checkbox"]:checked').count(), 7);
  assert.equal(await page.getByText('SEP-9', { exact: true }).count(), 0);
  await page.locator('select').filter({ has: page.locator('option[value="fund-1"]') }).selectOption('fund-1');
  const submitted = page.waitForRequest((request) => request.url().endsWith('/waybills/cash-vouchers/bulk-payment'));
  await page.getByRole('button', { name: /^Thanh toán 7 khoản/ }).click();
  await submitted;
  assert.deepEqual(payments[0].items.map((item) => item.waybill_id), ['1', '3', '4', '5', '6', '7', '8']);
  assert.equal(payments[0].items.reduce((sum, item) => sum + item.amount, 0), 7115200);
  assert(!payments[0].opening_debt_amount);
  await summary.waitFor();

  // The inherited period can be changed in the payment tab itself.
  await selectPeriodDate('Từ ngày gửi', '9/1/2026');
  assert(await page.getByRole('button', { name: 'In phiếu kê', exact: true }).isDisabled());
  await selectPeriodDate('Đến ngày gửi', '9/30/2026');
  await summary.getByText('201 đơn', { exact: true }).waitFor();
  assert.deepEqual([...new Set(billRequests.filter((url) => url.searchParams.get('ma_kh') === 'TANLB').map((url) => Number(url.searchParams.get('page'))))].sort(), [1, 2, 3]);
  await page.getByRole('button', { name: 'Chi trả khách', exact: true }).click();
  const payoutSelect = page.locator('select').filter({ has: page.locator('option[value="9"]') });
  assert.equal(await payoutSelect.locator('option:not([value=""])').count(), 1);
  assert.match(await payoutSelect.innerText(), /SEP-9/);
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();

  // The customer page starts without an inherited inventory scope.
  await page.goto(`${base}/warehouse/customers`);
  await page.getByRole('button', { name: 'Xem', exact: true }).click();
  await page.getByRole('button', { name: 'Thanh toán', exact: true }).first().click();
  await summary.getByText('209 đơn', { exact: true }).waitFor();
  await selectPeriodDate('Từ ngày gửi', '8/1/2026', 'previous');
  await selectPeriodDate('Đến ngày gửi', '8/31/2026', 'previous');
  await summary.getByText('8 đơn', { exact: true }).waitFor();
  assert.match(await summary.innerText(), /8\.115\.200/);
  assert.match(await summary.innerText(), /7\.115\.200/);
  await page.setViewportSize({ width: 390, height: 844 });
  await summary.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.tmp/customer-period-mobile.png' });
  assert(await page.getByRole('button', { name: 'In phiếu kê', exact: true }).isEnabled());
  assert.deepEqual(errors, []);
  console.log('PASS: inherited August filter, exact 8-order print and totals, September COD excluded, 209-order pagination, 7-bill payment payload, editable period, scoped payout, mobile, no browser errors');
} finally {
  await browser.close();
}
