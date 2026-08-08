import { describe, expect, it } from 'vitest';
import {
  applyAllOrdersColumnFilters,
  applyAllOrdersGlobalSearch,
  buildAllOrdersColumnFilterOptions,
  getAllOrdersColumnValue,
} from './allOrdersColumnFilters';
import type { WaybillInventoryItem } from './types';

const rows: WaybillInventoryItem[] = [
  { id: 1, waybill_code: 'ECO001', ma_kh: 'ACUU', sender_info: 'A Cừu | 0901', noi_den: 'HCM', noi_dung: 'Xe Đạp', sent_date: '2026-07-31', created_at: '2026-08-07T08:00:00.000Z' },
  { id: 2, waybill_code: 'ECO002', ma_kh: 'acuu', sender_info: 'Tên khác | 0902', noi_den: 'Hà Nội', noi_dung: 'Xe máy' },
  { id: 3, waybill_code: 'ECO003', ma_kh: 'ABC', sender_info: 'A Cừu | 0903', noi_den: 'HCM', receiver_address: 'Kho FY-01' },
];

describe('all-orders column filters', () => {
  it('groups customer codes case-insensitively by code, not customer name', () => {
    expect(buildAllOrdersColumnFilterOptions(rows, 'ma_kh')).toEqual([
      { value: 'ABC', label: 'ABC', count: 1 },
      { value: 'ACUU', label: 'ACUU', count: 2 },
    ]);
  });

  it('filters one or more columns by exact normalized value', () => {
    expect(applyAllOrdersColumnFilters(rows, { ma_kh: 'ACUU' }).map((row) => row.id)).toEqual([1, 2]);
    expect(applyAllOrdersColumnFilters(rows, { customer_name: 'A Cừu', noi_den: 'HCM' }).map((row) => row.id)).toEqual([1, 3]);
  });

  it('returns the displayed value used by the filter', () => {
    expect(getAllOrdersColumnValue(rows[0], 'waybill_code')).toBe('ECO001');
    expect(getAllOrdersColumnValue(rows[0], 'received_at')).toBe('31/07/2026');
  });

  it('searches actual values across one bill without returning unrelated bills', () => {
    expect(applyAllOrdersGlobalSearch(rows, 'xe đạp').map((row) => row.id)).toEqual([1]);
    expect(applyAllOrdersGlobalSearch(rows, 'xe dap').map((row) => row.id)).toEqual([1]);
    expect(applyAllOrdersGlobalSearch(rows, 'FY').map((row) => row.id)).toEqual([3]);
  });
});
