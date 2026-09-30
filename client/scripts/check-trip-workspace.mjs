import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Run against the local Vite server. All API requests use in-memory fixtures.
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const hubs = [{ id: '1', code: 'HCM', name: 'HCM' }, { id: '2', code: 'HAN', name: 'HAN' }];
const vendor = { id: '1', code: 'TEST', name: 'Test vendor' };
const truck = { id: '1', license_plate: '89H-062.55', vendor, vendor_id: '1' };
let trip = { id: '194', status: 'ARRIVED', manifest_id: '10', truck_id: '1', truck, vendor, vendor_id: '1', start_hub_id: '1', end_hub_id: '2', start_hub: hubs[0], end_hub: hubs[1], departure_time: '2026-09-22T09:49:00Z', trip_cost: 25000000, driver_name: 'Test driver', manifest: { id: '10', manifest_code: 'BK-260922-8637' }, delivery_summary: { total_waybills: 1, processed_waybills: 0, delivered_waybills: 0, pending_delivery_waybills: 1 } };
const manifest = { id: '10', manifest_code: 'BK-260922-8637', status: 'CLOSED', origin_hub_id: '1', dest_hub_id: '2', waybills: [{ id: '75', waybill_code: 'ECOHCM75', package_count: 50, order_total_packages: 50, loading_position: 1, current_state: 'AT_DEST_HUB', origin_hub_id: '1', dest_hub_id: '2', payment_type: 'PP' }] };
const searches = [];
let overviewRequests = 0;
let patches = 0;
await page.addInitScript(() => {
  localStorage.setItem('eco_access_token', 'local-test');
  localStorage.setItem('eco_user_profile', JSON.stringify({ id: '1', username: 'test', name: 'Test manager', role_mask: 127, hub_id: '1' }));
});
await page.route('**/api/v1/**', async (route) => {
  const url = new URL(route.request().url());
  const path = url.pathname.replace('/api/v1', '');
  let body = { data: [], total: 0 };
  if (path === '/hubs/active') body = hubs;
  else if (path === '/trips/incoming-overview') { overviewRequests++; body = { data: [trip], total: 1 }; }
  else if (path === '/trips/194') {
    if (route.request().method() === 'PATCH') { patches++; trip = { ...trip, ...route.request().postDataJSON() }; }
    body = trip;
  } else if (path === '/manifests/10') body = manifest;
  else if (path === '/trucks/1') body = truck;
  else if (path === '/trucks') body = { data: [truck], total: 1 };
  else if (path === '/vendors/active') body = [vendor];
  else if (path === '/trips') {
    const keyword = url.searchParams.get('keyword') || '';
    searches.push({ keyword, status: url.searchParams.get('status'), hub: url.searchParams.get('start_hub_id') });
    const found = !keyword || ['#194', '194', 'ECOHCM75', '89H-062.55'].includes(keyword);
    const data = found && url.searchParams.get('status') === 'ARRIVED' ? [trip] : [];
    body = { data, total: data.length };
  }
  await route.fulfill({ json: body });
});

try {
  const origin = process.env.TRIP_TEST_ORIGIN || 'http://127.0.0.1:5173';
  await page.goto(`${origin}/warehouse/incoming`);
  const filter = page.getByPlaceholder('Tìm BKS, bảng kê, tuyến, tài xế, mã NCC...');
  await filter.fill('TEST');
  await page.getByRole('button', { name: '#194', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Chi tiết chuyến #194', exact: true });
  await dialog.getByText('ECOHCM75', { exact: true }).first().waitFor();
  assert.equal(new URL(page.url()).pathname, '/warehouse/incoming');
  await dialog.getByRole('button', { name: 'Sửa BKS / NCC / tài xế / cước' }).click();
  await page.getByLabel('Cước xe (VNĐ)').fill('28000000');
  await page.getByRole('button', { name: 'Lưu thông tin', exact: true }).click();
  await page.waitForFunction(() => !document.body.textContent.includes('Lưu thông tin'));
  assert.equal(patches, 1);
  assert.equal(trip.trip_cost, 28000000);
  await dialog.getByRole('button', { name: 'Chi phí phát sinh', exact: true }).click();
  await dialog.getByRole('heading', { name: 'Chi phí phát sinh chuyến' }).waitFor();
  await dialog.getByRole('button', { name: 'Quay lại chuyến #194' }).click();
  await dialog.getByRole('button', { name: '+ Chi phí chuyến', exact: true }).click();
  await dialog.getByRole('button', { name: 'Quay lại chuyến #194' }).click();
  await dialog.getByRole('button', { name: 'Sửa bảng kê', exact: true }).click();
  await dialog.getByLabel('Vị trí ECOHCM75').fill('2');
  await dialog.getByRole('button', { name: 'Đóng chi tiết chuyến' }).click();
  await page.getByText('Đóng khi chưa lưu?', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  await dialog.getByRole('button', { name: 'Đóng sửa', exact: true }).click();
  const previousRequests = overviewRequests;
  const refreshed = page.waitForResponse((response) => response.url().includes('/trips/incoming-overview'));
  await dialog.getByRole('button', { name: 'Đóng chi tiết chuyến' }).click();
  await dialog.waitFor({ state: 'hidden' });
  await refreshed;
  assert(overviewRequests > previousRequests);
  assert.equal(await filter.inputValue(), 'TEST');
  await page.getByRole('cell', { name: '28.000.000', exact: true }).waitFor();

  await page.goto(`${origin}/trips/list`);
  const search = page.getByRole('searchbox', { name: 'Tìm chuyến theo số chuyến, BKS, vận đơn hoặc bảng kê' });
  for (const keyword of ['#194', '89H-062.55', 'ECOHCM75']) {
    await search.fill(keyword);
    await page.waitForResponse((response) => response.url().includes('/trips?') && new URL(response.url()).searchParams.get('keyword') === keyword && new URL(response.url()).searchParams.get('status') === 'ARRIVED');
    await page.getByText('Chuyến #194', { exact: true }).waitFor();
    assert(searches.some((item) => item.keyword === keyword));
  }
  await search.fill('missing');
  await page.getByText('Không tìm thấy chuyến phù hợp. Thử số chuyến, BKS hoặc mã vận đơn khác.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Xóa tìm kiếm chuyến' }).click();
  await page.getByText('Chuyến #194', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: trip modal, save/refresh, expense navigation, unsaved draft guard, preserved filters, trip/plate/waybill search, empty/reset states.');
} finally {
  await browser.close();
}
