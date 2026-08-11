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

  it('filters by the assigned last-mile employee', () => {
    const assignedRows: WaybillInventoryItem[] = [
      { id: 1, last_mile_driver: { id: 7, username: 'NVPHAT01', name: 'Nguyễn Văn Phát' } },
      { id: 2, last_mile_driver_name: 'Tài xế đối tác' },
    ];

    expect(getAllOrdersColumnValue(assignedRows[0], 'delivery_staff')).toBe('NVPHAT01 · Nguyễn Văn Phát');
    expect(applyAllOrdersColumnFilters(assignedRows, { delivery_staff: 'NVPHAT01 · Nguyễn Văn Phát' }))
      .toEqual([assignedRows[0]]);
  });

  it('indexes every split trip in the Chuyến / xe column', () => {
    const waybill: WaybillInventoryItem = {
      id: 4,
      trip_history: [
        { trip_id: '41', package_count: 127, license_plate: '15H-29078', departure_time: '2026-08-06', status: 'COMPLETED' },
        { trip_id: '46', package_count: 60, license_plate: '29E-078.04', departure_time: '2026-08-08', status: 'IN_TRANSIT' },
      ],
    };

    expect(getAllOrdersColumnValue(waybill, 'trip_label')).toContain('127 kiện · Chuyến #41');
    expect(getAllOrdersColumnValue(waybill, 'trip_label')).toContain('60 kiện · Chuyến #46');
  });

  it('searches actual values across one bill without returning unrelated bills', () => {
    expect(applyAllOrdersGlobalSearch(rows, 'xe đạp').map((row) => row.id)).toEqual([1]);
    expect(applyAllOrdersGlobalSearch(rows, 'xe dap').map((row) => row.id)).toEqual([1]);
    expect(applyAllOrdersGlobalSearch(rows, 'FY').map((row) => row.id)).toEqual([3]);
  });
});
