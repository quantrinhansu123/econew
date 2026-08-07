import { describe, expect, it } from 'vitest';
import {
  INVENTORY_DEFAULT_COLUMN_IDS,
  getDefaultVisibleColumnIds,
  normalizeInventoryVisibleColumnIds,
  resolvePrintColumnIds,
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

    const selected = normalizeInventoryVisibleColumnIds(['priority', 'order_code', 'bill_images'], true);
    expect(selected).toContain('order_code');
    expect(selected).toContain('priority');
    expect(selected).toContain('bill_images');
    expect(selected).toEqual(['priority', 'order_code', 'bill_images', 'actions']);
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

describe('inventory display values', () => {
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
