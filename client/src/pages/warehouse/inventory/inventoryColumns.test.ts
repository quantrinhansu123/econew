import { describe, expect, it } from 'vitest';
import {
  ALL_ORDERS_DEFAULT_COLUMN_IDS,
  INVENTORY_DEFAULT_COLUMN_IDS,
  getDefaultVisibleColumnIds,
  formatInventoryTripHistoryLine,
  normalizeAllOrdersVisibleColumnIds,
  normalizeInventoryVisibleColumnIds,
  resolvePrintColumnIds,
  resolveDeliveryStaff,
  resolveNoiDen,
  resolveTotalAmount,
  resolveUserNote,
  resolveVisibleColumnViews,
  type InventoryColumnId,
} from './inventoryColumns';
import type { WaybillInventoryItem } from './types';

const EXPECTED_DEFAULT_COLUMN_IDS: InventoryColumnId[] = [
  'stack_position',
  'loaded_at',
  'noi_den',
  'customer_name',
  'cong_sg',
  'dest_hub',
  'package_count',
  'cod_amount',
  'waybill_code',
  'user_note',
  'weight',
  'volumetric_weight',
  'volume',
];

describe('inventory visible columns', () => {
  it('uses the requested stock-list columns as the initial default order', () => {
    expect(INVENTORY_DEFAULT_COLUMN_IDS).toEqual(EXPECTED_DEFAULT_COLUMN_IDS);
    expect(getDefaultVisibleColumnIds(true)).toEqual([
      ...EXPECTED_DEFAULT_COLUMN_IDS,
      'actions',
    ]);
  });

  it('allows every default data column to be hidden and preserves the selected order', () => {
    expect(normalizeInventoryVisibleColumnIds([], true)).toEqual(['actions']);
    expect(normalizeInventoryVisibleColumnIds(['volume', 'loaded_at'], true)).toEqual([
      'volume',
      'loaded_at',
      'actions',
    ]);
  });

  it('does not show optional order, priority, and image columns until they are selected', () => {
    const defaults = getDefaultVisibleColumnIds(true);

    expect(defaults).not.toContain('order_code');
    expect(defaults).not.toContain('priority');
    expect(defaults).not.toContain('bill_images');
    expect(defaults).not.toContain('barcode');

    const selected = normalizeInventoryVisibleColumnIds(['priority', 'order_code', 'bill_images', 'barcode'], true);
    expect(selected).toContain('order_code');
    expect(selected).toContain('priority');
    expect(selected).toContain('bill_images');
    expect(selected).toContain('barcode');
    expect(selected).toEqual(['priority', 'order_code', 'bill_images', 'barcode', 'actions']);
  });

  it('keeps receiver, ward, and district columns optional', () => {
    const optionalReceiverColumns: InventoryColumnId[] = [
      'receiver_info',
      'receiver_ward',
      'receiver_district',
    ];
    const defaults = getDefaultVisibleColumnIds(true);
    optionalReceiverColumns.forEach((id) => expect(defaults).not.toContain(id));
    optionalReceiverColumns.forEach((id) => expect(resolvePrintColumnIds(defaults)).not.toContain(id));

    const selected = normalizeInventoryVisibleColumnIds(optionalReceiverColumns, true);
    optionalReceiverColumns.forEach((id) => expect(selected).toContain(id));
    optionalReceiverColumns.forEach((id) => expect(resolvePrintColumnIds(selected)).toContain(id));
  });

  it('removes unauthorized pricing columns even when they were previously selected', () => {
    expect(normalizeInventoryVisibleColumnIds(['freight'], false)).not.toContain('freight');
  });

  it('resolves the default views in order and labels Cộng SG as Nội dung hàng', () => {
    const views = resolveVisibleColumnViews(
      getDefaultVisibleColumnIds(true),
      'split-pending',
      true,
    );

    expect(views.map((column) => column.id)).toEqual([
      ...EXPECTED_DEFAULT_COLUMN_IDS,
      'actions',
    ]);
    expect(views.find((column) => column.id === 'cong_sg')?.label).toBe('Nội dung hàng');
  });

  it('labels the optional bill image column as Hình ảnh', () => {
    const views = resolveVisibleColumnViews(
      normalizeInventoryVisibleColumnIds(['bill_images'], true),
      'split-pending',
      true,
    );

    expect(views.find((column) => column.id === 'bill_images')?.label).toBe('Hình ảnh');
  });
});

describe('all orders visible columns', () => {
  it('moves package count next to content and shows the carrying trip after status', () => {
    expect(ALL_ORDERS_DEFAULT_COLUMN_IDS.indexOf('package_count')).toBe(
      ALL_ORDERS_DEFAULT_COLUMN_IDS.indexOf('cong_sg') + 1,
    );
    expect(ALL_ORDERS_DEFAULT_COLUMN_IDS.indexOf('trip_label')).toBe(
      ALL_ORDERS_DEFAULT_COLUMN_IDS.indexOf('order_status') + 1,
    );
    expect(ALL_ORDERS_DEFAULT_COLUMN_IDS.indexOf('delivery_staff')).toBe(
      ALL_ORDERS_DEFAULT_COLUMN_IDS.indexOf('trip_label') + 1,
    );
  });

  it('keeps required columns and preserves the canonical order for selected details', () => {
    expect(normalizeAllOrdersVisibleColumnIds(['volume', 'trip_label', 'package_count'])).toEqual([
      'stt',
      'waybill_code',
      'package_count',
      'trip_label',
      'volume',
      'actions',
    ]);
  });

  it('resolves only the columns selected for the all-orders table', () => {
    const selected = normalizeAllOrdersVisibleColumnIds(['waybill_code', 'package_count', 'trip_label']);
    const views = resolveVisibleColumnViews(selected, 'all-orders', true);

    expect(views.map((column) => column.id)).toEqual([
      'stt',
      'waybill_code',
      'package_count',
      'trip_label',
      'actions',
    ]);
    expect(views.find((column) => column.id === 'trip_label')?.label).toBe('Chuyến / xe');
  });
});

describe('inventory display values', () => {
  it('shows the last-mile employee code with a readable name fallback', () => {
    expect(resolveDeliveryStaff({
      id: 1,
      last_mile_driver: { id: 7, username: 'NVPHAT01', name: 'Nguyễn Văn Phát' },
    })).toBe('NVPHAT01 · Nguyễn Văn Phát');
    expect(resolveDeliveryStaff({ id: 2, last_mile_driver_name: 'Tài xế đối tác' })).toBe('Tài xế đối tác');
  });

  it('formats each trip allocation with packages, trip, plate, date, and trip status', () => {
    expect(formatInventoryTripHistoryLine({
      trip_id: '41',
      package_count: 127,
      license_plate: '15H-29078',
      departure_time: '2026-08-06T08:00:00.000Z',
      status: 'IN_TRANSIT',
    })).toBe('127 kiện · Chuyến #41 · BKS 15H-29078 · 06/08 · Đang chạy');
  });

  it('prefers the waybill destination over the destination hub', () => {
    const waybill: WaybillInventoryItem = {
      id: 1,
      noi_den: 'DAN',
      dest_hub: { id: 2, code: 'HCM', name: 'Bưu cục Hồ Chí Minh' },
    };

    expect(resolveNoiDen(waybill)).toBe('DAN');
  });

  it('keeps the user-entered note and strips internal metadata', () => {
    const note = [
      'ma_kh=ALPHATIC',
      'content=Hàng mẫu',
      'receiver_company_name=Công ty nhận',
      'Gọi khách trước khi giao',
    ].join(' | ');

    expect(resolveUserNote({ note, notes: null })).toBe('Gọi khách trước khi giao');
  });

  it('decodes the user note stored by the order form', () => {
    const userNote = 'Liên hệ trước khi giao | gọi số phụ';
    const note = `ma_kh=ALPHATIC | user_note=${encodeURIComponent(userNote)} | content=Hàng mẫu`;

    expect(resolveUserNote({ note, notes: null })).toBe(userNote);
  });

  it('shows selected special goods in the inventory note column', () => {
    const note = 'user_note=Giao%20bu%E1%BB%95i%20s%C3%A1ng | special_goods=HIGH_VALUE,FRAGILE';
    expect(resolveUserNote({ note, notes: null })).toBe(
      'Giao buổi sáng · Giá trị cao, Dễ vỡ',
    );
  });

  it('keeps extra services inside the total instead of subtracting them', () => {
    expect(resolveTotalAmount({
      id: 1,
      freight_amount: 557_000,
      note: 'cuoc_chinh=532000 | phu_phi=25000',
    })).toBe(557_000);
  });
});
