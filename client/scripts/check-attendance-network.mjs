// Start Vite on 6061, then: pnpm exec node scripts/check-attendance-network.mjs
// All API traffic is mocked. No real credentials, network registration or attendance is used.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const origin = process.env.ATTENDANCE_TEST_ORIGIN || 'http://127.0.0.1:6061';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const mutations = [];
const checks = [];
const artifactDir = join('..', '.tmp', 'attendance-network');
let currentIp = '8.8.8.8';
let gpsAvailable = false;
let locations = [{ id: '10', name: 'Văn phòng HAN', address: 'Hà Nội', latitude: 21, longitude: 105, radius_meters: 100, verification_method: 'gps', allowed_ips: [], is_active: true }];
let logs = [];
let networkRequests = 0;

page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => {
  localStorage.setItem('eco_access_token', 'test-only');
  localStorage.setItem('eco_refresh_token', 'test-only');
  if (!localStorage.getItem('eco_user_profile')) localStorage.setItem('eco_user_profile', JSON.stringify({ id: '1', username: 'test', full_name: 'Test', role_mask: 127, hub_ids: ['1'] }));
  window.attendanceGpsCalls = 0;
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
    getCurrentPosition(resolve) {
      window.attendanceGpsCalls++;
      resolve({ coords: { latitude: 21, longitude: 105, accuracy: 5 } });
    },
  } });
});

await page.route('**/api/v1/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname.replace('/api/v1', '');
  const method = request.method();
  const matched = locations.find((item) => item.is_active && item.verification_method === 'ip' && item.allowed_ips.includes(currentIp));
  let json = [];
  let status = 200;
  if (path === '/auth/refresh') json = { access_token: 'test-only' };
  else if (path === '/attendance/network') {
    networkRequests++;
    json = { ip: currentIp, is_public: currentIp !== '127.0.0.1', matched_location: matched ? { id: matched.id, name: matched.name } : null, gps_available: gpsAvailable };
  } else if (path === '/attendance/locations' && method === 'GET') json = locations;
  else if (path === '/attendance/locations/active') json = locations.filter((item) => item.is_active);
  else if (path === '/attendance/today') json = { check_in: logs.find((log) => log.type === 'check_in' && log.status === 'success') ?? null, check_out: logs.find((log) => log.type === 'check_out' && log.status === 'success') ?? null };
  else if (path === '/attendance/logs' || path === '/attendance/my-logs') json = { items: logs, meta: { total: logs.length } };
  else if (path.startsWith('/attendance/locations/') && method === 'PUT') {
    const body = request.postDataJSON();
    mutations.push({ path, body });
    const id = path.split('/').at(-1);
    locations = locations.map((location) => location.id === id ? { ...location, ...body } : location);
    json = locations.find((location) => location.id === id);
  } else if (path === '/attendance/check' && method === 'POST') {
    const body = request.postDataJSON();
    checks.push(body);
    if (!matched && !(gpsAvailable && body.latitude === 21 && body.longitude === 105)) {
      status = 422;
      json = { message: 'Mạng hiện tại không được phép chấm công. Hãy kết nối mạng văn phòng.', reason: 'NETWORK_NOT_ALLOWED' };
    } else {
      const location = matched || locations[0];
      const verification_method = matched ? 'ip' : 'gps';
      const log = { id: String(logs.length + 1), ...body, status: 'success', verification_method, location, source_ip: currentIp, accuracy_warning: false, accuracy: body.accuracy ?? null, distance_meters: matched ? null : 0, created_at: new Date().toISOString() };
      logs.push(log);
      json = { success: true, message: 'Chấm công thành công.', location, verification_method, accuracy_warning: false, distance_meters: log.distance_meters };
    }
  } else if (!['GET', 'HEAD'].includes(method)) {
    throw new Error(`Unexpected mutation: ${method} ${path}`);
  }
  await route.fulfill({ status, json });
});

const visibleText = (text) => page.getByText(text, { exact: true }).waitFor({ state: 'visible' });
const assertNoOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Page must fit the viewport');

try {
  await page.goto(`${origin}/hr/attendance-admin`);
  await page.getByRole('button', { name: 'Sửa điểm Văn phòng HAN', exact: true }).click();
  await page.getByLabel('Cách chấm công').selectOption('ip');
  await page.getByRole('button', { name: 'Lấy IP mạng hiện tại', exact: true }).click();
  await page.getByLabel('IP public được phép').waitFor();
  assert.equal(await page.getByLabel('IP public được phép').inputValue(), '8.8.8.8');
  assert.equal(mutations.length, 0, 'Capturing an IP must not save it automatically');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await visibleText('Đã cập nhật điểm chấm công.');
  assert.deepEqual(mutations[0].body, { name: 'Văn phòng HAN', address: 'Hà Nội', radius_meters: 100, is_active: true, verification_method: 'ip', allowed_ips: ['8.8.8.8'] });
  console.log('PASS: register network using one capture button, explicit save, no GPS required');

  currentIp = '1.1.1.1';
  await page.getByRole('button', { name: 'Sửa điểm Văn phòng HAN', exact: true }).click();
  await page.getByRole('button', { name: 'Lấy IP mạng hiện tại', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('textarea')?.value === '1.1.1.1');
  assert.deepEqual(locations[0].allowed_ips, ['8.8.8.8']);
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await visibleText('Đã cập nhật điểm chấm công.');
  assert.deepEqual(locations[0].allowed_ips, ['1.1.1.1']);
  console.log('PASS: dynamic IP update replaces the old IP only after save');

  currentIp = '127.0.0.1';
  await page.getByRole('button', { name: 'Sửa điểm Văn phòng HAN', exact: true }).click();
  await page.getByRole('button', { name: 'Lấy IP mạng hiện tại', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Chưa lấy được IP public' }).waitFor();
  assert.equal(await page.getByLabel('IP public được phép').inputValue(), '1.1.1.1');
  assert.equal(mutations.length, 2);
  console.log('PASS: local/private IP cannot replace a registered office network');

  currentIp = '1.1.1.1';
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${origin}/hr/attendance-admin`);
  await page.getByRole('button', { name: 'Sửa điểm', exact: true }).click();
  await page.getByLabel('IP public được phép').waitFor();
  await assertNoOverflow();
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: join(artifactDir, 'admin-mobile.png'), fullPage: true });

  await page.goto(`${origin}/hr/attendance`);
  await visibleText('Mạng hợp lệ: Văn phòng HAN');
  const before = networkRequests;
  await page.getByRole('button', { name: /Check-in ngay/ }).click();
  await page.getByRole('button', { name: /Check-out ngay/ }).waitFor();
  await page.getByRole('status').filter({ hasText: 'Chấm công thành công' }).waitFor();
  assert(networkRequests > before, 'Check-in must recheck the current network');
  assert.deepEqual(checks[0], { type: 'check_in' });
  assert.equal(await page.evaluate(() => window.attendanceGpsCalls), 0);
  await assertNoOverflow();
  await page.screenshot({ path: join(artifactDir, 'employee-mobile.png'), fullPage: true });
  console.log('PASS: mobile check-in without GPS, visible success and no page overflow');

  currentIp = '9.9.9.9';
  await page.getByRole('button', { name: /Check-out ngay/ }).click();
  await page.getByRole('status').filter({ hasText: 'Mạng hiện tại không được phép' }).waitFor();
  assert.equal(await page.evaluate(() => window.attendanceGpsCalls), 0);
  assert.deepEqual(checks.at(-1), { type: 'check_out' });
  console.log('PASS: switching network after page load rejects the next check-out');

  logs = [];
  gpsAvailable = true;
  locations = [{ ...locations[0], verification_method: 'gps', allowed_ips: [] }];
  await page.goto(`${origin}/hr/attendance`);
  await page.getByRole('button', { name: /Check-in ngay/ }).click();
  await page.getByRole('button', { name: /Check-out ngay/ }).waitFor();
  assert.equal(await page.evaluate(() => window.attendanceGpsCalls), 1);
  assert.deepEqual(checks.at(-1), { type: 'check_in', latitude: 21, longitude: 105, accuracy: 5 });
  console.log('PASS: existing GPS attendance still requests fresh coordinates');

  await page.evaluate(() => localStorage.setItem('eco_user_profile', JSON.stringify({ id: '1', username: 'accountant', role_mask: 16 })));
  await page.goto(`${origin}/hr/attendance-admin`);
  await page.getByRole('heading', { name: 'Danh sách điểm', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Cách chấm công').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Sửa điểm', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: accountants can view attendance but cannot edit network settings; no browser errors');
} finally {
  await browser.close();
}
