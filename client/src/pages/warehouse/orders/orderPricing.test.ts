import { describe, expect, it } from 'vitest';
import { sampleOrderForm } from './orderFormData';
import {
  applyPricingToForm,
  buildCreatePayload,
  calcOrderPricing,
  isPricingField,
  waybillToOrderForm,
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

    expect(pricing.tongCuoc).toBe('557.000');
    expect(pricing.thanhToan).toBe('1.057.000');
  });

  it('adds extra services to the total for other payment methods', () => {
    const pricing = calcOrderPricing({
      ...receiverPaysForm(),
      phuongThuc: 'Công nợ tháng',
    });

    expect(pricing.thanhToan).toBe('557.000');
  });

  it('recalculates pricing as soon as the payment method changes', () => {
    expect(isPricingField('phuongThuc')).toBe(true);
  });

  it('stores CC and COD separately without double counting collection totals', () => {
    const payload = buildCreatePayload(receiverPaysForm(), 0);

    expect(payload.freight_amount).toBe(557_000);
    expect(payload.cc_amount).toBe(557_000);
    expect(payload.cod_amount).toBe(500_000);
    expect(payload.note).toContain('cuoc_chinh=532000');
    expect(payload.note).toContain('phu_phi=25000');
    expect(payload.note).toContain('tong_cuoc=557000');
    expect(payload.note).toContain('thanh_toan=1057000');
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

  it('falls back to actual weight for Kg pricing when converted weight is empty', () => {
    const pricing = calcOrderPricing({
      ...sampleOrderForm(),
      donGiaDonVi: 'Kg',
      donGia: '5.000',
      klKg: '297',
      klQuyDoi: '',
    });

    expect(pricing.tongCuoc).toBe('1.485.000');
  });

  it('defaults to no VAT even when a VAT invoice is requested', () => {
    const form = { ...receiverPaysForm(), coVat: true };
    expect(form.vatEnabled).toBe(false);
    expect(calcOrderPricing(form)).toMatchObject({ vat: '0', thanhToan: '1.057.000' });
    expect(buildCreatePayload(form, 0).note).toContain('vat_enabled=0');
  });

  it('adds 8% VAT on freight and extra services without taxing COD', () => {
    const form = { ...receiverPaysForm(), vatEnabled: true };
    expect(calcOrderPricing(form)).toMatchObject({
      vat: '44.560', tongCuoc: '601.560', thanhToan: '1.101.560',
    });
    const payload = buildCreatePayload(form, 0);
    expect(payload).toMatchObject({ freight_amount: 601_560, cc_amount: 601_560, cod_amount: 500_000 });
    expect(payload.note).toContain('vat=44560');
    expect(payload.note).toContain('thue_suat=8%');
    expect(payload.note).toContain('thanh_toan=1101560');
  });

  it('rounds automatic VAT to a whole dong and recalculates after freight changes', () => {
    const form = applyPricingToForm({ ...receiverPaysForm(), vatEnabled: true });
    const updated = applyPricingToForm({ ...form, donGia: '532.007' });
    expect(updated.vat).toBe('44.561');
    expect(updated.thanhToan).toBe('1.101.568');
    expect(isPricingField('vatEnabled')).toBe(true);
    expect(isPricingField('vat')).toBe(true);
  });

  it.each(['40.000', '0'])('keeps manually entered VAT %s after saving, reopening and changing freight', (vat) => {
    const form = applyPricingToForm({ ...receiverPaysForm(), vatEnabled: true, vatManual: true, vat });
    const payload = buildCreatePayload(form, 0);
    const restored = waybillToOrderForm({ id: '1', ...payload }, []);
    expect(restored).toMatchObject({ vatEnabled: true, vatManual: true, vat });
    expect(restored.thanhToan).toBe(form.thanhToan);
    expect(applyPricingToForm({ ...restored, donGia: '600.000' }).vat).toBe(vat);
  });

  it('keeps automatic VAT calculation after reopening a saved order', () => {
    const payload = buildCreatePayload({ ...receiverPaysForm(), vatEnabled: true }, 0);
    const restored = waybillToOrderForm({ id: '1', ...payload }, []);
    expect(restored).toMatchObject({ vatEnabled: true, vatManual: false, vat: '44.560' });
    expect(applyPricingToForm({ ...restored, donGia: '600.000' }).vat).toBe('50.000');
  });

  it('does not turn VAT or extra services into the main freight when reopening a zero-priced order', () => {
    const form = { ...receiverPaysForm(), donGia: '0', vatEnabled: true, vatManual: true, vat: '5.000' };
    const payload = buildCreatePayload(form, 0);
    const restored = waybillToOrderForm({ id: '1', ...payload }, []);
    expect(restored.donGia).toBe('');
    expect(restored.thanhToan).toBe('530.000');
    expect(buildCreatePayload(restored, 0).freight_amount).toBe(30_000);
  });

  it('removes VAT from all totals when unchecked', () => {
    const form = applyPricingToForm({
      ...receiverPaysForm(), vatEnabled: false, vatManual: true, vat: '40.000',
    });
    expect(form).toMatchObject({ vat: '0', thueSuat: '0%', thanhToan: '1.057.000' });
    const payload = buildCreatePayload(form, 0);
    expect(payload.freight_amount).toBe(557_000);
    expect(payload.note).toContain('vat=0');
    expect(payload.note).toContain('vat_manual=0');
  });

  it('does not mistake legacy invoice metadata for a VAT amount', () => {
    const form = waybillToOrderForm({ id: '1', note: 'co_vat=1' }, []);
    expect(form).toMatchObject({ coVat: true, vatEnabled: false, vat: '0' });
  });
});
