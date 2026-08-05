import { describe, expect, it } from 'vitest';
import {
  formatWaybillHistoryValue,
  waybillHistoryActionLabel,
  waybillHistoryFieldLabel,
} from './waybillHistory';

describe('waybill edit history presentation', () => {
  it('uses clear Vietnamese labels for audit actions and fields', () => {
    expect(waybillHistoryActionLabel('UPDATED')).toBe('Chỉnh sửa vận đơn');
    expect(waybillHistoryActionLabel('LEGACY_UPDATE')).toContain('trước khi bật lịch sử');
    expect(waybillHistoryFieldLabel('receiver_address')).toBe('Địa chỉ nhận');
  });

  it('formats COD as Vietnamese money and preserves blank values', () => {
    expect(formatWaybillHistoryValue('cod_amount', 500000)).toBe('500.000 đ');
    expect(formatWaybillHistoryValue('receiver_address', null)).toBe('—');
  });
});
