// Start Vite, then run: pnpm exec node scripts/check-delivery-distance.mjs
// All API requests are intercepted. No real account, HERE quota or bill is used.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const origin = process.env.DISTANCE_TEST_ORIGIN || 'http://127.0.0.1:6061';
const errors = [];
const estimates = [];
const mutations = [];
let usageFailure = false;
let estimateFailure = false;
let holdNext = false;
let releaseRequest;
let usage;
let snapshot = 0;
const quota = () => ({ used: 1, limit: 30000, free_limit: 30000, remaining: 29999, resets_at: '2099-11-01T00:00:00Z', minute_used: 1, minute_limit: 60, minute_remaining: 59, minute_resets_at: null, blocked_until: null, blocked: false });
const resetUsage = () => { usage = { provider: 'HERE', configured: true, month: '2026-10', directions: quota(), geocoding: quota() }; };
const usageSnapshot = () => ({ ...usage, observed_at: new Date(1_800_000_000_000 + ++snapshot).toISOString() });
const field = label => page.locator('label').filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).locator('..').locator('input, select').first();
const panel = page.getByText('Khoảng cách giao hàng', { exact: true }).locator('../..');
const gps = panel.getByLabel('Tọa độ điểm giao (nếu có)');
const calculate = panel.getByRole('button', { name: 'Tính lại km', exact: true });

async function eventually(predicate, message) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(25);
  }
  assert.fail(message);
}
async function tick(ms) {
  await page.clock.runFor(ms);
  await delay(30);
}
async function calculated(count) {
  await eventually(() => estimates.length === count, `Expected ${count} estimates, got ${estimates.length}`);
  await eventually(async () => await calculate.count() === 1, 'Calculation did not settle');
}
async function fresh(overrides = {}) {
  resetUsage();
  usageFailure = false;
  estimateFailure = false;
  holdNext = false;
  Object.assign(usage, overrides);
  estimates.length = 0;
  await page.goto(`${origin}/orders/new`);
  await eventually(async () => { await tick(100); return await field('Địa chỉ nhận').isVisible(); }, 'Form did not render');
  await eventually(async () => (await field('Số bill').inputValue()).startsWith('ECO'), 'Form did not initialize');
  await eventually(async () => await panel.getByRole('progressbar').count() === 2, 'Missing HERE counters');
}

page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  localStorage.setItem('eco_access_token', 'test-only');
  localStorage.setItem('eco_refresh_token', 'test-only');
  localStorage.setItem('eco_user_profile', JSON.stringify({ id: '1', username: 'test', name: 'Test', role_mask: 127, hub_ids: ['1'] }));
});
await page.route('**/api/v1/**', async route => {
  const request = route.request();
  const path = new URL(request.url()).pathname.replace('/api/v1', '');
  if (!['GET', 'HEAD'].includes(request.method()) && !['/delivery-distance/estimate', '/auth/refresh'].includes(path)) mutations.push(path);
  if (path === '/delivery-distance/usage') {
    await route.fulfill({ status: usageFailure ? 503 : 200, json: usageFailure ? { message: 'Test usage unavailable' } : usageSnapshot() });
    return;
  }
  if (path === '/delivery-distance/estimate') {
    const body = request.postDataJSON();
    estimates.push(body);
    if (holdNext) {
      holdNext = false;
      await new Promise(resolve => { releaseRequest = resolve; });
    }
    await route.fulfill({ status: estimateFailure ? 502 : 200, json: estimateFailure
      ? { message: 'Test HERE timeout', usage: usageSnapshot() }
      : { provider: 'HERE', distance_meters: 16273, duration_seconds: 2000, approximate_address: false,
        matched_address: body.receiver_coordinates || body.receiver_address, location_source: body.receiver_coordinates ? 'COORDINATES' : 'ADDRESS',
        destination: { latitude: 10.78, longitude: 106.7 }, hub_name: `HUB ${body.dest_hub_id}`, maps_url: 'https://www.google.com/maps/dir/?api=1', usage: usageSnapshot() } });
    return;
  }
  let json = [];
  if (path === '/auth/refresh') json = { access_token: 'test-only' };
  if (path === '/hubs/active') json = [
    { id: '1', code: 'HAN', name: 'Hà Nội', is_active: true },
    { id: '2', code: 'HCM', name: 'Hồ Chí Minh', is_active: true },
    { id: '3', code: 'DNG', name: 'Đà Nẵng', is_active: true },
  ];
  if (path === '/waybills/next-code') json = { waybill_code: 'ECOHAN000001' };
  if (path === '/waybills') json = { items: [], meta: { total: 0 } };
  await route.fulfill({ json });
});

try {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 100));
  await fresh();
  await tick(2000);
  assert.equal(estimates.length, 0, 'Blank forms must not spend HERE quota');

  await field('Tỉnh/Thành').selectOption('Hồ Chí Minh');
  await field('Quận/Huyện').fill('Bình Tân');
  await field('Phường/Xã').fill('Tân Tạo');
  await field('Địa chỉ nhận').fill('26 Trần');
  await tick(600);
  await field('Địa chỉ nhận').fill('26 Trần Hải');
  await tick(600);
  await field('Địa chỉ nhận').fill('26 Trần Hải Phụng');
  await tick(900);
  assert.equal(estimates.length, 0, 'Typing must restart the debounce timer');
  await tick(200);
  await calculated(1);
  assert.deepEqual(estimates[0], { dest_hub_id: '2', receiver_address: '26 Trần Hải Phụng, Tân Tạo, Bình Tân, Hồ Chí Minh, Việt Nam' });
  console.log('PASS: blank form, one debounced request, all separate address fields');

  for (const [label, value] of [['Phường/Xã', 'An Lạc'], ['Quận/Huyện', 'Quận 1'], ['Tỉnh/Thành', 'Hà Nội'], ['Địa chỉ nhận', '1 Tràng Tiền']]) {
    const count = estimates.length;
    const oldAddress = estimates.at(-1).receiver_address;
    if (label === 'Tỉnh/Thành') await field(label).selectOption(value);
    else await field(label).fill(value);
    assert.equal(await panel.getByText(`Điểm được tính: ${oldAddress}`, { exact: true }).count(), 0, 'Old results must disappear immediately');
    await tick(1100);
    await calculated(count + 1);
    assert(estimates.at(-1).receiver_address.includes(value));
  }
  await field('HUB đến (nơi tập kết)').selectOption('3');
  await tick(1100);
  await calculated(6);
  assert.equal(estimates.at(-1).dest_hub_id, '3', 'Every selected hub must be supported');
  await field('Tên liên hệ').fill('Test contact');
  await panel.getByRole('button', { name: 'Làm mới hạn mức' }).click();
  await tick(65_000);
  assert.equal(estimates.length, 6, 'Unrelated fields and quota polling must not repeat estimates');
  console.log('PASS: address edits, every hub, hidden old results, unrelated edits and polling');

  await gps.fill('invalid GPS');
  await tick(2000);
  assert(await calculate.isDisabled());
  await gps.fill('10.779971,106.700052');
  await tick(2000);
  assert.equal(estimates.length, 6, 'Pasting coordinates must wait for the button');
  await calculate.evaluate(button => { button.click(); button.click(); });
  await calculated(7);
  assert.equal(estimates.at(-1).receiver_coordinates, '10.779971,106.700052');
  await tick(2000);
  assert.equal(estimates.length, 7, 'Double clicks must reserve only one request');
  await field('Địa chỉ nhận').fill('58 Quốc Tử Giám');
  assert.equal(await gps.inputValue(), '', 'Address edits must clear coordinate overrides');
  await tick(1100);
  await calculated(8);
  assert.equal(estimates.at(-1).receiver_coordinates, undefined);
  console.log('PASS: invalid GPS, manual GPS, double click, returning to automatic address mode');

  await field('Địa chỉ nhận').fill('2 Công xã Paris');
  await tick(500);
  await gps.fill('10.78,106.7');
  await tick(2000);
  assert.equal(estimates.length, 8, 'GPS must cancel a pending automatic estimate');
  await calculate.click();
  await calculated(9);

  holdNext = true;
  await field('Địa chỉ nhận').fill('10 Địa chỉ cũ');
  await tick(1100);
  await eventually(() => estimates.length === 10 && releaseRequest, 'Old request did not start');
  await field('Địa chỉ nhận').fill('20 Địa chỉ trung gian');
  await tick(500);
  await field('Địa chỉ nhận').fill('30 Địa chỉ mới nhất');
  await tick(1500);
  assert.equal(estimates.length, 10, 'Estimates must not overlap');
  releaseRequest();
  await eventually(async () => await calculate.count() === 1, 'Old request did not finish');
  assert.equal(await panel.getByText(/^Điểm được tính:/).count(), 0, 'Late results must not be displayed');
  await tick(1100);
  await calculated(11);
  assert(estimates.at(-1).receiver_address.startsWith('30 Địa chỉ mới nhất'));
  console.log('PASS: GPS cancels debounce; late requests cannot overwrite or skip the newest address');

  estimateFailure = true;
  await field('Địa chỉ nhận').fill('40 Địa chỉ lỗi');
  await tick(1100);
  await calculated(12);
  await panel.getByText('Test HERE timeout', { exact: true }).waitFor();
  await panel.getByRole('button', { name: 'Làm mới hạn mức' }).click();
  await tick(65_000);
  assert.equal(estimates.length, 12, 'HERE errors must never auto retry, including after quota refresh');
  estimateFailure = false;
  await calculate.click();
  await calculated(13);
  console.log('PASS: no automatic retries after errors; manual retry remains available');

  for (const overrides of [{ configured: false }, { directions: { ...quota(), used: 30000, remaining: 0, blocked: true } }, { geocoding: { ...quota(), used: 30000, remaining: 0, blocked: true } }]) {
    await fresh(overrides);
    await field('Địa chỉ nhận').fill('26 Trần Hải Phụng');
    await tick(2000);
    assert.equal(estimates.length, 0, 'Unconfigured or exhausted HERE must not be called');
    assert(await calculate.isDisabled());
  }
  await gps.fill('10.78,106.7');
  await tick(2000);
  assert.equal(estimates.length, 0);
  await calculate.click();
  await calculated(1);
  assert.equal(estimates[0].receiver_coordinates, '10.78,106.7', 'Coordinates can bypass exhausted Geocoding');

  await fresh();
  await field('HUB đến (nơi tập kết)').selectOption('');
  await field('Địa chỉ nhận').fill('26 Trần Hải Phụng');
  await tick(2000);
  assert.equal(estimates.length, 0, 'Missing hub must block estimates');
  await field('Địa chỉ nhận').fill('26');
  await field('HUB đến (nơi tập kết)').selectOption('2');
  await tick(2000);
  assert.equal(estimates.length, 0, 'Incomplete street addresses must block estimates');
  usageFailure = true;
  await panel.getByRole('button', { name: 'Làm mới hạn mức' }).click();
  await panel.getByText('Chưa đọc được hạn mức.', { exact: false }).waitFor();
  await field('Địa chỉ nhận').fill('26 Trần Hải Phụng');
  await tick(2000);
  assert.equal(estimates.length, 0, 'Unreadable usage must block estimates');
  console.log('PASS: configuration, quotas, missing hub, incomplete address and usage failures');

  usageFailure = false;
  await panel.getByRole('button', { name: 'Làm mới hạn mức' }).click();
  await eventually(async () => await calculate.isEnabled(), 'Quota recovery did not enable estimates');
  await tick(1100);
  await calculated(1);
  for (const width of [375, 844, 1440]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Horizontal overflow at ${width}px`);
    if (process.env.DISTANCE_TEST_SCREENSHOTS) {
      await mkdir(process.env.DISTANCE_TEST_SCREENSHOTS, { recursive: true });
      await panel.screenshot({ path: join(process.env.DISTANCE_TEST_SCREENSHOTS, `distance-${width}.png`) });
    }
  }
  assert.deepEqual(mutations, [], 'Distance estimates must not save bills or other data');
  assert.deepEqual(errors, [], 'No browser JavaScript errors');
  console.log('PASS: mobile/landscape/desktop layout, no bill writes, no browser errors');
} catch (error) {
  console.error({ url: page.url(), pageErrors: errors, text: (await page.locator('body').innerText()).slice(0, 1600) });
  throw error;
} finally {
  releaseRequest?.();
  await browser.close();
}
