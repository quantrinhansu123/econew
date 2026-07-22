import { describe, expect, it } from 'vitest';
import { emptyOrderForm } from './orderFormData';
import { normalizeBillingUnit } from './orderFormUtils';

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
});
