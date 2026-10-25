// Real PostgreSQL + Nest controller + Vite UI, using only a disposable schema.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
Object.assign(process.env, require('../node_modules/dotenv').parse(fs.readFileSync(path.join(root, 'server/.env'))));
process.env.TS_NODE_PROJECT = path.join(root, 'server/tsconfig.json');
require('../node_modules/ts-node/register/transpile-only');
const { DataSource } = require('../node_modules/typeorm');
const { Test } = require('../node_modules/@nestjs/testing');
const { ValidationPipe } = require('../node_modules/@nestjs/common');
const { chromium } = require('../../client/node_modules/playwright');
const source = require('../src/data-source').default;
const { WaybillsService } = require('../src/waybills/waybills.service');
const { WaybillsController } = require('../src/waybills/waybills.controller');
const { JwtAuthGuard } = require('../src/auth/guards/jwt-auth.guard');
const { GeminiWaybillRecognitionService } = require('../src/waybills/gemini-waybill-recognition.service');
const entities = Object.fromEntries(['waybill','waybill-split','waybill-change-log','waybill-cash-voucher'].map(name => {
  const module = require(`../src/waybills/${name}.entity`); return [name, Object.values(module).find(value => typeof value === 'function')];
}));
const { HubEntity } = require('../src/hubs/hub.entity');
const { UserEntity } = require('../src/users/user.entity');
const { TripEntity } = require('../src/trips/trip.entity');
const { TruckEntity } = require('../src/trucks/truck.entity');
const { VendorEntity } = require('../src/vendors/vendor.entity');
const { ManifestEntity } = require('../src/manifests/manifest.entity');
const { ManifestWaybillEntity } = require('../src/manifests/manifest-waybill.entity');
const { AddDeliveryDispatchPlans1833000000000: Migration } = require('../src/migrations/1833000000000-AddDeliveryDispatchPlans');
const schema = `eco_dispatch_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
assert(/^eco_dispatch_test_\d+_[a-f0-9]+$/.test(schema));
const admin = new DataSource({ ...source.options, synchronize: false, migrations: [], logging: false });
let db, app, browser, created = false;
const output = path.join(root, '.tmp/delivery-dispatch-check');
const checks = [];
const pass = name => { checks.push(name); console.log('PASS: ' + name); };
const cleanError = error => String(error.message || error).replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted database URL]').replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted token]');

(async () => {
  try {
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    db = new DataSource({ ...source.options, entities: source.options.entities.filter(entity => entity.name !== 'CustomerListViewEntity'), schema, synchronize: false, migrations: [], logging: false, extra: { ...source.options.extra, max: 5 } });
    await db.initialize();
    assert(db.entityMetadatas.every(metadata => metadata.tablePath.startsWith(schema + '.')), 'Every test entity must be in the temporary schema');
    await db.synchronize();
    const W = entities.waybill, S = entities['waybill-split'], L = entities['waybill-change-log'];
    const repo = entity => db.getRepository(entity);
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      const migration = new Migration();
      await migration.down(runner); await migration.up(runner); await migration.up(runner);
      await runner.commitTransaction();
    } catch (error) { await runner.rollbackTransaction(); throw error; } finally { await runner.release(); }
    pass('migration up/down/up and idempotency in an isolated schema');

    const hubs = await repo(HubEntity).save(['HAN', 'HCM'].map(code => ({ code, name: code, province: code, district: 'Test', address: 'Test' })));
    const actor = await repo(UserEntity).save({ email: 'dispatch-test@example.test', username: 'dispatch-test', full_name: 'Quản lý kiểm thử', phone: '0900000001', password_hash: 'unused-test-hash', role_mask: 127, hub_id: hubs[1].id });
    const driver = await repo(UserEntity).save({ email: 'driver-test@example.test', username: 'driver-test', full_name: 'Tài xế kiểm thử', phone: '0900000002', password_hash: 'unused-test-hash', role_mask: 4, hub_id: hubs[1].id });
    const truck = await repo(TruckEntity).save({ license_plate: '51H-TEST', payload: 1000, fuel_consumption_limit: 10, status: 'IN_TRIP', ownership_type: 'INTERNAL', hub_id: hubs[1].id, driver_id: driver.id });
    const trip = await repo(TripEntity).save({ start_hub_id: hubs[0].id, end_hub_id: hubs[1].id, departure_time: new Date(), status: 'IN_TRANSIT' });
    const base = { sender_info: 'Người gửi kiểm thử', receiver_info: 'Người nhận kiểm thử', weight: 10, length: 0, width: 0, height: 0, volumetric_weight: 10, payment_type: 'PP', cost_amount: '0', package_count: 10, origin_hub_id: hubs[0].id, dest_hub_id: hubs[1].id };
    const bill = await repo(W).save({ ...base, waybill_code: 'PLAN-TEST', current_state: 'IN_TRANSIT' });
    const split = await repo(S).save({ waybill_id: bill.id, trip_id: trip.id, package_count: 10, load_status: 'IN_TRANSIT' });
    const finished = await repo(W).save({ ...base, waybill_code: 'DONE-TEST', current_state: 'DELIVERED', delivery_assignment_type: 'TECHNOLOGY', last_mile_driver_name: 'Tài xế cũ', delivery_photo_url: 'https://example.test/proof.jpg', delivery_time: new Date('2026-10-20T01:00:00Z') });
    const payableCalls = [];
    const service = new WaybillsService(repo(W), repo(L), repo(HubEntity), repo(S), repo(TripEntity), repo(TruckEntity), repo(UserEntity), repo(VendorEntity), repo(ManifestEntity), repo(ManifestWaybillEntity), repo(entities['waybill-cash-voucher']), db, {}, { refreshPayableBalance: async id => { payableCalls.push(id); } });
    const module = await Test.createTestingModule({ controllers: [WaybillsController], providers: [
      { provide: WaybillsService, useValue: service }, { provide: GeminiWaybillRecognitionService, useValue: {} },
    ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.use((request, response, next) => { request.user = actor; next(); });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.listen(0, '127.0.0.1');
    const api = await app.getUrl();

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' });
    const errors = [];
    const writes = [];
    page.on('pageerror', error => errors.push(cleanError(error)));
    await page.addInitScript(actor => { localStorage.setItem('eco_access_token', 'test-only'); localStorage.setItem('eco_user_profile', JSON.stringify(actor)); }, { ...actor, name: actor.full_name });
    await page.route('**/api/v1/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const pathname = url.pathname.replace('/api/v1', '');
      if (request.method() !== 'GET') writes.push({ path: pathname, body: request.postDataJSON() });
      if (pathname.startsWith('/waybills/delivery-') || pathname.includes('/delivery-dispatch') || pathname.endsWith('/history') || pathname.endsWith('/status') || pathname.endsWith('/delivery-preparation')) {
        const response = await route.fetch({ url: api + url.pathname + url.search });
        await route.fulfill({ response }); return;
      }
      if (pathname === '/auth/refresh') { await route.fulfill({ json: { access_token: 'test-only' } }); return; }
      if (pathname === '/hubs/active') { await route.fulfill({ json: hubs }); return; }
      if (pathname === '/routes/active') { await route.fulfill({ json: [{ id: '1', code: 'R1', name: 'Tuyến thử', hub_id: hubs[1].id }] }); return; }
      await route.fulfill({ json: [] });
    });
    await page.goto('http://127.0.0.1:6061/nhiem-vu-giao-hang');
    await page.getByLabel('Trạng thái', { exact: true }).selectOption('IN_TRANSIT');
    const row = page.locator('article').filter({ hasText: 'PLAN-TEST' });
    await row.getByRole('button', { name: 'Lập kế hoạch', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Kế hoạch điều phối', exact: true });
    await dialog.getByLabel('Xe nội bộ', { exact: true }).selectOption(String(truck.id));
    await dialog.getByLabel('Chi phí giao dự kiến (VNĐ)').fill('150000');
    await dialog.getByLabel('Ghi chú điều phối').fill('Gọi trước 15 phút');
    await dialog.getByRole('button', { name: 'Lưu kế hoạch', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    let storedSplit = await repo(S).findOneByOrFail({ id: split.id });
    assert.equal(storedSplit.delivery_dispatch.kind, 'PLAN');
    assert.equal(storedSplit.delivery_dispatch.version, 1);
    assert.equal(storedSplit.load_status, 'IN_TRANSIT');
    assert.equal((await repo(W).findOneByOrFail({ id: bill.id })).current_state, 'IN_TRANSIT');
    assert.equal(payableCalls.length, 0);
    assert(!writes.some(write => write.path.endsWith('/status')));
    pass('real form saves a plan for an in-transit split and a busy truck without dispatch or payable changes');

    await page.reload();
    await page.getByLabel('Trạng thái', { exact: true }).selectOption('IN_TRANSIT');
    await row.getByRole('button', { name: 'Sửa kế hoạch', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Kế hoạch điều phối', exact: true });
    assert.equal(await dialog.getByLabel('Chi phí giao dự kiến (VNĐ)').inputValue(), '150.000');
    await dialog.getByLabel('Tên tài xế', { exact: true }).fill('Tài xế đã sửa');
    await dialog.getByRole('button', { name: 'Lưu kế hoạch', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    storedSplit = await repo(S).findOneByOrFail({ id: split.id });
    const input = { assignment_type: 'INTERNAL', driver_id: driver.id, truck_id: truck.id, delivery_cost: 150000, license_plate: '51H-TEST', expected_version: 2, split_id: split.id, trip_id: trip.id };
    const race = await Promise.allSettled(['A', 'B'].map(name => service.updateDeliveryDispatch(bill.id, { ...input, driver_name: `Tài xế ${name}` }, actor)));
    assert.equal(race.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(race.find(result => result.status === 'rejected').reason.getStatus(), 409);
    storedSplit = await repo(S).findOneByOrFail({ id: split.id });
    assert.equal(storedSplit.delivery_dispatch.version, 3);
    pass('plans survive reload and two simultaneous edits allow one winner, one HTTP 409');

    await db.query(`ALTER TABLE "${schema}"."waybill_change_logs" ADD CONSTRAINT test_reject_plan_history CHECK (action <> 'DELIVERY_PLAN_UPDATED') NOT VALID`);
    await assert.rejects(service.updateDeliveryDispatch(bill.id, { ...input, driver_name: 'Must roll back', expected_version: 3 }, actor));
    assert.deepEqual((await repo(S).findOneByOrFail({ id: split.id })).delivery_dispatch, storedSplit.delivery_dispatch);
    await db.query(`ALTER TABLE "${schema}"."waybill_change_logs" DROP CONSTRAINT test_reject_plan_history`);
    pass('a failed history insert rolls back the entire plan update in PostgreSQL');

    await repo(TripEntity).update(trip.id, { status: 'ARRIVED', arrival_time: new Date() });
    await repo(S).update(split.id, { load_status: 'ARRIVED' });
    await page.getByLabel('Trạng thái', { exact: true }).selectOption('AT_DEST_HUB');
    await row.getByRole('button', { name: 'Xác nhận / xử lý', exact: true }).click();
    await page.getByRole('button', { name: 'Lưu xử lý', exact: true }).click();
    await row.getByRole('button', { name: 'Bàn giao', exact: true }).click();
    await page.getByRole('button', { name: /Bàn giao tài xế chặng cuối/ }).click();
    await page.getByRole('button', { name: 'Xác nhận bàn giao', exact: true }).click();
    await page.getByLabel('Trạng thái', { exact: true }).selectOption('OUT_FOR_DELIVERY');
    await row.getByRole('button', { name: 'Sửa điều phối', exact: true }).waitFor();
    storedSplit = await repo(S).findOneByOrFail({ id: split.id });
    assert.equal(storedSplit.load_status, 'OUT_FOR_DELIVERY');
    assert.equal(storedSplit.delivery_dispatch.kind, 'ASSIGNMENT');
    assert.equal(storedSplit.delivery_dispatch.version, 4);
    assert.equal(storedSplit.delivery_dispatch.driver_name, (race.find(result => result.status === 'fulfilled')).value.delivery_dispatch.driver_name);
    pass('arrival retains the plan; only an explicit ready confirmation and handover start delivery');

    await row.getByRole('button', { name: 'Sửa điều phối', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Chỉnh sửa điều phối', exact: true });
    await dialog.getByLabel('Tên tài xế', { exact: true }).fill('Tài xế nhận thay');
    await dialog.getByRole('button', { name: 'Lưu điều phối', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal((await repo(S).findOneByOrFail({ id: split.id })).load_status, 'OUT_FOR_DELIVERY');
    await row.getByRole('button', { name: 'Xem lịch sử', exact: true }).click();
    let history = page.getByRole('dialog', { name: 'Lịch sử giao hàng và điều phối', exact: true });
    await history.getByText('Lập kế hoạch điều phối', { exact: true }).waitFor();
    await history.getByText('Tài xế nhận thay', { exact: false }).waitFor();
    fs.mkdirSync(output, { recursive: true });
    await history.screenshot({ path: path.join(output, 'history-desktop.png') });
    await history.getByRole('button', { name: 'Đóng lịch sử', exact: true }).click();
    pass('dispatched assignments stay editable with actor, timestamp and old/new history');

    await page.getByLabel('Trạng thái', { exact: true }).selectOption('DELIVERED,RETURNED');
    const doneRow = page.locator('article').filter({ hasText: 'DONE-TEST' });
    await doneRow.getByRole('button', { name: 'Sửa điều phối', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Chỉnh sửa điều phối', exact: true });
    await dialog.getByLabel('Ứng dụng / tài xế', { exact: true }).fill('Grab / Đã sửa');
    await dialog.getByRole('button', { name: 'Lưu điều phối', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const done = await repo(W).findOneByOrFail({ id: finished.id });
    assert.equal(done.current_state, 'DELIVERED');
    assert.equal(done.delivery_photo_url, 'https://example.test/proof.jpg');
    assert.equal(done.delivery_time.toISOString(), '2026-10-20T01:00:00.000Z');
    pass('completed assignments stay editable without changing delivery status, photo or time');

    const { VendorsService } = require('../src/vendors/vendors.service');
    const vendorA = await repo(VendorEntity).save({ code: 'TEST_A', name: 'Đối tác A', status: 'ACTIVE' });
    const vendorB = await repo(VendorEntity).save({ code: 'TEST_B', name: 'Đối tác B', status: 'ACTIVE' });
    const financeBill = await repo(W).save({ ...base, waybill_code: 'COST-TEST', current_state: 'OUT_FOR_DELIVERY', delivery_assignment_type: 'PARTNER', last_mile_vendor_id: vendorB.id, last_mile_cost_amount: '200000' });
    const snapshot = (kind, vendor, cost) => ({ ...storedSplit.delivery_dispatch, kind, assignment_type: 'PARTNER', vendor_id: vendor.id, vendor_name: vendor.name, delivery_cost: cost, version: 1 });
    const financeSplits = await repo(S).save([
      { waybill_id: financeBill.id, trip_id: trip.id, package_count: 3, load_status: 'OUT_FOR_DELIVERY', delivery_dispatch: snapshot('ASSIGNMENT', vendorA, 100000) },
      { waybill_id: financeBill.id, trip_id: trip.id, package_count: 3, load_status: 'OUT_FOR_DELIVERY', delivery_dispatch: snapshot('ASSIGNMENT', vendorB, 200000) },
      { waybill_id: financeBill.id, trip_id: trip.id, package_count: 4, load_status: 'ARRIVED', delivery_dispatch: snapshot('PLAN', vendorA, 900000) },
    ]);
    await repo(W).save({ ...base, waybill_code: 'LEGACY-COST', current_state: 'OUT_FOR_DELIVERY', delivery_assignment_type: 'PARTNER', last_mile_vendor_id: vendorA.id, last_mile_cost_amount: '50000' });
    const vendorService = new VendorsService(repo(VendorEntity), db.getRepository('VendorDebtEntryEntity'), db.getRepository('VendorPaymentEntity'), repo(TripEntity), repo(ManifestWaybillEntity), db.getRepository('ExpenseEntity'), repo(W), db.getRepository('VendorPaymentAllocationEntity'));
    await vendorService.refreshPayableBalance(vendorA.id);
    await vendorService.refreshPayableBalance(vendorB.id);
    assert.equal(Number((await repo(VendorEntity).findOneByOrFail({ id: vendorA.id })).payable_balance), 150000);
    assert.equal(Number((await repo(VendorEntity).findOneByOrFail({ id: vendorB.id })).payable_balance), 200000);
    const ledger = await vendorService.getLedger(vendorB.id, {});
    assert.equal(ledger.entries.filter(entry => entry.type === 'COST').length, 1);
    assert(ledger.entries.some(entry => entry.id.endsWith(`split-${financeSplits[1].id}`)));
    await service.updateDeliveryDispatch(financeBill.id, { assignment_type: 'PARTNER', vendor_id: vendorB.id, delivery_cost: 120000, expected_version: 1, split_id: financeSplits[0].id, trip_id: trip.id }, actor);
    assert(payableCalls.includes(vendorA.id) && payableCalls.includes(vendorB.id));
    await vendorService.refreshPayableBalance(vendorA.id);
    await vendorService.refreshPayableBalance(vendorB.id);
    assert.equal(Number((await repo(VendorEntity).findOneByOrFail({ id: vendorA.id })).payable_balance), 50000);
    assert.equal(Number((await repo(VendorEntity).findOneByOrFail({ id: vendorB.id })).payable_balance), 320000);
    await assert.rejects(service.updateLastMileCost(financeBill.id, { amount: 1 }, actor), error => error.getStatus() === 400);
    await service.updateLastMileCost(bill.id, { amount: 175000 }, actor);
    assert.equal((await repo(S).findOneByOrFail({ id: split.id })).delivery_dispatch.delivery_cost, 175000);
    const invalid = await fetch(`${api}/api/v1/waybills/${bill.id}/delivery-dispatch`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignment_type: 'TECHNOLOGY', driver_name: 'Invalid', delivery_cost: -1, expected_version: -1 }) });
    assert.equal(invalid.status, 400);
    pass('real vendor balances exclude plans, avoid double billing, preserve legacy charges and follow per-split vendor changes');
    pass('reconciled costs stay synchronized and invalid API input is rejected');

    await page.setViewportSize({ width: 390, height: 844 });
    await doneRow.getByRole('button', { name: 'Sửa điều phối', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Chỉnh sửa điều phối', exact: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await dialog.getByRole('button', { name: 'Lưu điều phối', exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => { const buttons = [...document.querySelectorAll('button')]; return buttons.some(button => button.textContent.trim() === 'Lưu điều phối' && !button.disabled); });
    await dialog.screenshot({ path: path.join(output, 'dispatch-mobile.png') });
    assert(await dialog.evaluate(element => element.contains(document.activeElement)));
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    pass('mobile layout and browser JavaScript checks');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checks, javascript_errors: errors, production_rows_changed: 0 }, null, 2));
  } catch (error) {
    const failedPage = browser?.contexts()[0]?.pages()[0];
    if (failedPage) {
      fs.mkdirSync(output, { recursive: true });
      await failedPage.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
      console.log(JSON.stringify({ failed_url: failedPage.url(), text: (await failedPage.locator('body').innerText()).slice(0, 2000) }));
    }
    throw error;
  } finally {
    if (browser) {
      for (const context of browser.contexts()) {
        for (const page of context.pages()) await page.unrouteAll({ behavior: 'wait' });
        await context.unrouteAll({ behavior: 'wait' });
      }
      await browser.close();
    }
    if (app) await app.close();
    if (db?.isInitialized) await db.destroy();
    if (created && /^eco_dispatch_test_\d+_[a-f0-9]+$/.test(schema)) { await admin.query(`DROP SCHEMA "${schema}" CASCADE`); console.log('Temporary schema removed.'); }
    if (admin.isInitialized) await admin.destroy();
  }
})().catch(error => { console.error(cleanError(error)); process.exitCode = 1; });
