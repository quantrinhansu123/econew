import { describe, expect, it } from 'vitest';
import { getDispatchCellValue, type DispatchLink } from './manifestDispatchDefaults';

const link = (waybill: DispatchLink['waybill']): DispatchLink => ({
  waybill_id: waybill?.id,
  waybill,
});

describe('manifest dispatch bill-backed columns', () => {
  it('maps service and delivery method from the bill instead of stale dispatch cells', () => {
    const row = link({
      id: 1,
      note: 'dich_vu=Nhanh 48h|giao_hang=Nhận tại kho ECO',
    });
    const saved = { '1': { dv: 'TC', noi_tra: 'Tận nơi' } };

    expect(getDispatchCellValue(saved, row, '1', 'dv')).toBe('N48');
    expect(getDispatchCellValue(saved, row, '1', 'noi_tra')).toBe('Nhận tại kho ECO');
  });

  it('follows delivery task status and completion date', () => {
    const row = link({
      id: 2,
      current_state: 'DELIVERED',
      delivery_assignment_type: 'CUSTOMER_PICKUP',
      delivery_time: '2026-08-18T08:00:00+07:00',
    });
    const saved = { '2': { trang_thai_giao: 'Trạng thái cũ', ngay_hoan_thanh: '01/01' } };

    expect(getDispatchCellValue(saved, row, '2', 'trang_thai_giao')).toContain('Phát thành công');
    expect(getDispatchCellValue(saved, row, '2', 'ngay_hoan_thanh')).toBe('18/08');
  });
});
