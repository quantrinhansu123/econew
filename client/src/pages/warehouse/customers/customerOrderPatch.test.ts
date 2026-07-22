import { describe, expect, it } from 'vitest';
import type { HubSummary } from '../orders/types';
import type { CustomerRecord } from './customerFormTypes';
import { applyReceiverByDestination, customerToOrderPatch } from './customerOrderPatch';

const hubs: HubSummary[] = [
  { id: '1', code: 'HAN', name: 'Bưu cục Hà Nội' },
  { id: '2', code: 'HCM', name: 'Bưu cục Hồ Chí Minh' },
];

const customer = {
  id: '10',
  code: 'ADAO',
  name: 'A Đào',
  short_name: 'A Đào',
  mobile: '0901111222',
  phone_landline: '02833334444',
  address: '10 Nguyễn Huệ',
  destination_province: 'HCM',
  receiver_han: 'Kho A Đào HN',
  phone_han: '0912222333',
  address_han: '1 Trần Duy Hưng, Cầu Giấy, Hà Nội',
  receiver_hcm: 'Kho A Đào HCM',
  phone_hcm: '0934455122',
  address_hcm: '129 Trần Đại Nghĩa, Bình Chánh, Hồ Chí Minh',
  discount_percent: 0,
  status: 'ACTIVE',
  waybill_count: 0,
} as unknown as CustomerRecord;

describe('customer order autofill', () => {
  it('keeps customer phone separate from the HCM receiver phone', () => {
    const patch = customerToOrderPatch(customer, hubs);

    expect(patch.dienThoaiKh).toBe('0901111222');
    expect(patch.dienThoaiNhan).toBe('0934455122');
    expect(patch.giaoHang).toBeUndefined();
  });

  it('switches receiver contact when destination changes between HAN and HCM', () => {
    expect(applyReceiverByDestination(customer, 'HAN')).toMatchObject({
      nguoiNhan: 'Kho A Đào HN',
      dienThoaiNhan: '0912222333',
      diaChiNhan: '1 Trần Duy Hưng, Cầu Giấy, Hà Nội',
    });
    expect(applyReceiverByDestination(customer, 'HCM')).toMatchObject({
      nguoiNhan: 'Kho A Đào HCM',
      dienThoaiNhan: '0934455122',
      diaChiNhan: '129 Trần Đại Nghĩa, Bình Chánh, Hồ Chí Minh',
    });
  });

  it('does not copy a receiver phone into an empty customer phone', () => {
    const patch = customerToOrderPatch({
      ...customer,
      mobile: null,
      phone_landline: null,
    }, hubs);

    expect(patch.dienThoaiKh).toBe('');
    expect(patch.dienThoaiNhan).toBe('0934455122');
  });

  it('rejects a receiver phone accidentally duplicated in sender contact fields', () => {
    const patch = customerToOrderPatch({
      ...customer,
      mobile: '0934 455 122',
      phone_landline: '0934455122',
    }, hubs);

    expect(patch.dienThoaiKh).toBe('');
    expect(patch.dienThoaiNhan).toBe('0934455122');
  });

  it('uses a distinct customer phone when another contact field duplicates the receiver phone', () => {
    const patch = customerToOrderPatch({
      ...customer,
      mobile: '0934455122',
      phone_landline: '02833334444',
    }, hubs);

    expect(patch.dienThoaiKh).toBe('02833334444');
    expect(patch.dienThoaiNhan).toBe('0934455122');
  });
});
