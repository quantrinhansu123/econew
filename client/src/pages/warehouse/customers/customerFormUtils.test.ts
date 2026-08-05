import { describe, expect, it } from 'vitest';
import { emptyCustomerForm } from './customerFormTypes';
import { customerToForm, formToPayload } from './customerFormUtils';

describe('customer bill defaults form', () => {
  it('serializes editable bill defaults for the API', () => {
    const payload = formToPayload({
      ...emptyCustomerForm(),
      code: 'ABC',
      name: 'Khách ABC',
      default_service: 'Nhanh 48h',
      default_delivery_method: 'Tận nơi',
      default_billing_unit: 'Khối',
      default_payment_method: 'Công nợ tháng',
      default_special_goods: ['OVERSIZED', 'LIQUID'],
      price_list_url: 'https://example.com/bao-gia.xlsx',
      price_list_name: 'bao-gia.xlsx',
    }, false);

    expect(payload).toMatchObject({
      default_service: 'Nhanh 48h',
      default_delivery_method: 'Tận nơi',
      default_billing_unit: 'Khối',
      default_payment_method: 'Công nợ tháng',
      default_special_goods: 'OVERSIZED,LIQUID',
      price_list_url: 'https://example.com/bao-gia.xlsx',
      price_list_name: 'bao-gia.xlsx',
    });
  });

  it('restores saved special goods and lets edit mode clear defaults', () => {
    const form = customerToForm({
      id: '1',
      code: 'ABC',
      name: 'Khách ABC',
      destination_province: 'HCM',
      default_special_goods: 'HIGH_VALUE,FRAGILE',
    } as any);
    expect(form.destination_province).toBe('Hồ Chí Minh');
    expect(form.default_special_goods).toEqual(['HIGH_VALUE', 'FRAGILE']);

    const cleared = formToPayload({
      ...emptyCustomerForm(),
      code: 'ABC',
      name: 'Khách ABC',
    }, true);
    expect(cleared.default_service).toBeNull();
    expect(cleared.default_special_goods).toBeNull();
  });
});
