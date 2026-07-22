import { describe, expect, it } from 'vitest';
import { emptyOrderForm } from './orderFormData';
import { normalizeBillingUnit, validateNewOrderForm } from './orderFormUtils';

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

  it('normalizes legacy Cân values to Kg', () => {
    expect(normalizeBillingUnit('Cân')).toBe('Kg');
    expect(normalizeBillingUnit('kg')).toBe('Kg');
  });

  it('allows an order without a customer phone', () => {
    expect(validateNewOrderForm(validOrderForm(), 0)).toBe('');
  });

  it('still rejects an invalid customer phone when one is entered', () => {
    expect(validateNewOrderForm({ ...validOrderForm(), dienThoaiKh: '123' }, 0))
      .toBe('Điện thoại khách hàng không hợp lệ.');
  });
});
