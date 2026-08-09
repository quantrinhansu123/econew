import { describe, expect, it } from 'vitest';
import {
  emptyOrderForm,
  GIAO_HANG_OPTIONS,
  normalizeDeliveryMethod,
  todayInputValue,
} from './orderFormData';
import {
  calcCuocChinhAmount,
  normalizeBillingUnit,
  parseDecimalNumber,
  validateNewOrderForm,
} from './orderFormUtils';

const validOrderForm = () => ({
  ...emptyOrderForm(),
  soBill: 'ECOHAN1',
  nguoiGui: 'Khách gửi',
  nguoiNhan: 'Khách nhận',
  dienThoaiNhan: '0901234567',
  diaChiNhan: 'Địa chỉ nhận',
  originHubId: '1',
  destHubId: '2',
  klKg: '1',
});

describe('new order defaults', () => {
  it('defaults delivery to door-to-door and billing unit to Kg', () => {
    const form = emptyOrderForm();
    expect(form.giaoHang).toBe('Tận nơi');
    expect(form.donGiaDonVi).toBe('Kg');
  });

  it('only offers the two requested delivery methods and normalizes old values', () => {
    expect(GIAO_HANG_OPTIONS).toEqual(['Tận nơi', 'Nhận tại kho ECO']);
    expect(normalizeDeliveryMethod('Lấy tại kho')).toBe('Nhận tại kho ECO');
    expect(normalizeDeliveryMethod('Văn phòng')).toBe('Tận nơi');
  });

  it('normalizes legacy Cân values to Kg', () => {
    expect(normalizeBillingUnit('Cân')).toBe('Kg');
    expect(normalizeBillingUnit('kg')).toBe('Kg');
  });

  it('uses the Vietnam calendar date instead of the UTC date', () => {
    expect(todayInputValue(new Date('2026-08-07T17:30:00.000Z'))).toBe('2026-08-08');
  });

  it('allows a past sent date and requires a sent date', () => {
    expect(validateNewOrderForm({ ...validOrderForm(), ngayDi: '2026-07-31' }, 0)).toBe('');
    expect(validateNewOrderForm({ ...validOrderForm(), ngayDi: '' }, 0)).toBe('Ngày gửi trên bill là bắt buộc.');
  });

  it.each(['4.6', '4,6'])('reads %s as the same decimal volume', (value) => {
    expect(parseDecimalNumber(value)).toBe(4.6);
  });

  it('calculates the same freight for dot and comma volume input', () => {
    const base = {
      ...emptyOrderForm(),
      donGiaDonVi: 'Khối',
      donGia: '1000',
    };

    expect(calcCuocChinhAmount({ ...base, m3: '4.6' })).toBe(4600);
    expect(calcCuocChinhAmount({ ...base, m3: '4,6' })).toBe(4600);
  });

  it('allows an order without a customer phone', () => {
    expect(validateNewOrderForm(validOrderForm(), 0)).toBe('');
  });

  it('allows an order without a receiver name', () => {
    expect(validateNewOrderForm({ ...validOrderForm(), nguoiNhan: '' }, 0)).toBe('');
  });

  it('allows an order without sender information', () => {
    expect(validateNewOrderForm({
      ...validOrderForm(),
      nguoiGui: '',
      diaChiGui: '',
    }, 0)).toBe('');
  });

  it('allows an order without any receiver information', () => {
    expect(validateNewOrderForm({
      ...validOrderForm(),
      tenCongTyNhan: '',
      nguoiNhan: '',
      dienThoaiNhan: '',
      diaChiNhan: '',
      huyen: '',
      quanHuyen: '',
      phuongXa: '',
    }, 0)).toBe('');
  });

  it('allows an order without actual weight, converted weight, or CBM', () => {
    expect(validateNewOrderForm({
      ...validOrderForm(),
      klKg: '',
      klQuyDoi: '',
      m3: '',
    }, 0)).toBe('');
  });

  it('still rejects an invalid receiver phone when one is entered', () => {
    expect(validateNewOrderForm({ ...validOrderForm(), dienThoaiNhan: '123' }, 0))
      .toBe('Số điện thoại người nhận không hợp lệ.');
  });

  it('still rejects an invalid customer phone when one is entered', () => {
    expect(validateNewOrderForm({ ...validOrderForm(), dienThoaiKh: '123' }, 0))
      .toBe('Điện thoại khách hàng không hợp lệ.');
  });
});
