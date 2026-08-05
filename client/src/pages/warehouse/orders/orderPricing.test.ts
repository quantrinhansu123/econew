import { describe, expect, it } from 'vitest';
import { sampleOrderForm } from './orderFormData';
import {
  buildCreatePayload,
  calcOrderPricing,
  isPricingField,
} from './orderFormUtils';

const receiverPaysForm = () => ({
  ...sampleOrderForm(),
  phuongThuc: 'Người nhận thanh toán',
  donGiaDonVi: 'Trọn gói',
  donGia: '532.000',
  cod: '500.000',
  giamGia: '25.000',
});

describe('order payment pricing', () => {
  it('collects COD plus total freight when the receiver pays', () => {
    const pricing = calcOrderPricing(receiverPaysForm());

    expect(pricing.tongCuoc).toBe('532.000');
    expect(pricing.thanhToan).toBe('1.032.000');
  });

  it('keeps the existing freight calculation for other payment methods', () => {
    const pricing = calcOrderPricing({
      ...receiverPaysForm(),
      phuongThuc: 'Công nợ tháng',
    });

    expect(pricing.thanhToan).toBe('507.000');
  });

  it('recalculates pricing as soon as the payment method changes', () => {
    expect(isPricingField('phuongThuc')).toBe(true);
  });

  it('stores CC and COD separately without double counting collection totals', () => {
    const payload = buildCreatePayload(receiverPaysForm(), 0);

    expect(payload.freight_amount).toBe(532_000);
    expect(payload.cc_amount).toBe(532_000);
    expect(payload.cod_amount).toBe(500_000);
    expect(payload.note).toContain('thanh_toan=1032000');
  });

  it('uses converted weight for Kg pricing and keeps actual weight only for loading', () => {
    const form = {
      ...sampleOrderForm(),
      donGiaDonVi: 'Kg',
      donGia: '100.000',
      klKg: '800',
      klQuyDoi: '3,37',
      m3: '0,10',
    };

    const pricing = calcOrderPricing(form);
    const payload = buildCreatePayload(form, 3.37);

    expect(pricing.tongCuoc).toBe('337.000');
    expect(payload.weight).toBe(800);
    expect(payload.volumetric_weight).toBe(3.37);
    expect(payload.the_tich_m3).toBe(0.1);
  });
});
