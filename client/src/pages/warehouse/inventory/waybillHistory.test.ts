import { describe, expect, it } from 'vitest';
import {
  formatWaybillHistoryValue,
  waybillHistoryActionLabel,
  waybillHistoryFieldLabel,
} from './waybillHistory';

describe('waybill edit history presentation', () => {
  it('uses clear Vietnamese labels for audit actions and fields', () => {
    expect(waybillHistoryActionLabel('UPDATED')).toBe('Chỉnh sửa vận đơn');
    expect(waybillHistoryActionLabel('COD_RECONCILED')).toBe('Xác nhận thu COD vào sổ quỹ');
    expect(waybillHistoryActionLabel('LEGACY_UPDATE')).toContain('trước khi bật lịch sử');
    expect(waybillHistoryFieldLabel('receiver_address')).toBe('Địa chỉ nhận');
    expect(waybillHistoryFieldLabel('cod_fund_id')).toBe('Sổ quỹ nhận tiền');
    expect(waybillHistoryFieldLabel('cod_reconciliation_note')).toBe('Nội dung xác nhận COD');
  });

  it('formats COD as Vietnamese money and preserves blank values', () => {
    expect(formatWaybillHistoryValue('cod_amount', 500000)).toBe('500.000 đ');
    expect(formatWaybillHistoryValue('cod_collected_amount', 850000)).toBe('850.000 đ');
    expect(formatWaybillHistoryValue('receiver_address', null)).toBe('—');
  });
  it('presents dispatch edits with clear old/new values and money', () => {
    expect(waybillHistoryActionLabel('DELIVERY_PLAN_CREATED')).toBe('Lập kế hoạch điều phối');
    expect(waybillHistoryActionLabel('DELIVERY_ASSIGNMENT_UPDATED')).toBe('Chỉnh sửa điều phối giao hàng');
    expect(waybillHistoryFieldLabel('dispatch_driver_name')).toBe('Tài xế điều phối');
    expect(formatWaybillHistoryValue('dispatch_assignment_type', 'PARTNER')).toBe('Xe đối tác');
    expect(formatWaybillHistoryValue('dispatch_kind', 'PLAN')).toBe('Kế hoạch');
    expect(formatWaybillHistoryValue('dispatch_delivery_cost', 120000)).toBe('120.000 đ');
  });
});
