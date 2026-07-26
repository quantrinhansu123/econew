import { describe, expect, it } from 'vitest';
import {
  INVENTORY_FIXED_COLUMN_IDS,
  normalizeInventoryVisibleColumnIds,
  resolveNoiDen,
  resolveUserNote,
  resolveVisibleColumnViews,
  type InventoryColumnId,
} from './inventoryColumns';
import type { WaybillInventoryItem } from './types';

const EXPECTED_FIXED_COLUMN_IDS: InventoryColumnId[] = [
  'stack_position',
  'loaded_at',
  'noi_den',
  'customer_name',
  'cong_sg',
  'dest_hub',
  'package_count',
  'receiver_info',
  'receiver_ward',
  'receiver_district',
  'cod_amount',
  'waybill_code',
  'user_note',
  'weight',
  'volume',
];

describe('inventory visible columns', () => {
  it('keeps the requested stock-list columns fixed in the exact requested order', () => {
    expect(INVENTORY_FIXED_COLUMN_IDS).toEqual(EXPECTED_FIXED_COLUMN_IDS);
    expect(normalizeInventoryVisibleColumnIds([], true)).toEqual([
      ...EXPECTED_FIXED_COLUMN_IDS,
      'actions',
    ]);
  });

  it('does not show optional order, priority, and image columns until they are selected', () => {
    const defaults = normalizeInventoryVisibleColumnIds([], true);

    expect(defaults).not.toContain('order_code');
    expect(defaults).not.toContain('priority');
    expect(defaults).not.toContain('bill_images');

    const selected = normalizeInventoryVisibleColumnIds(['priority', 'order_code', 'bill_images'], true);
    expect(selected).toContain('order_code');
    expect(selected).toContain('priority');
    expect(selected).toContain('bill_images');
    expect(selected.filter((id) => EXPECTED_FIXED_COLUMN_IDS.includes(id))).toEqual(
      EXPECTED_FIXED_COLUMN_IDS,
    );
  });

  it('removes unauthorized pricing columns even when they were previously selected', () => {
    expect(normalizeInventoryVisibleColumnIds(['freight'], false)).not.toContain('freight');
  });

  it('resolves the fixed views in order and labels Cộng SG as Nội dung hàng', () => {
    const views = resolveVisibleColumnViews(
      normalizeInventoryVisibleColumnIds([], true),
      'split-pending',
      true,
    );

    expect(views.map((column) => column.id)).toEqual([
      ...EXPECTED_FIXED_COLUMN_IDS,
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
});
