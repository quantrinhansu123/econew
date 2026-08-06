import { describe, expect, it } from 'vitest';
import { emptyOrderForm } from '../orders/orderFormData';
import type { CustomerRecord } from './customerFormTypes';
import {
  applyReceiverByDestination,
  customerToOrderPatch,
  receiverPatchForProvinceChange,
} from './customerOrderPatch';

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
    const patch = customerToOrderPatch(customer);
    const receiverPatch = applyReceiverByDestination(customer, 'HCM');

    expect(patch.dienThoaiKh).toBe('0901111222');
    expect(patch.dienThoaiNhan).toBeUndefined();
    expect(receiverPatch.dienThoaiNhan).toBe('0934455122');
    expect(patch.giaoHang).toBe('Tận nơi');
  });

  it('only autofills the fixed receiver when destination province is HCM', () => {
    expect(applyReceiverByDestination(customer, 'HCM')).toMatchObject({
      nguoiNhan: 'Kho A Đào HCM',
      dienThoaiNhan: '0934455122',
      diaChiNhan: '129 Trần Đại Nghĩa, Bình Chánh, Hồ Chí Minh',
    });
    expect(applyReceiverByDestination(customer, 'Đà Nẵng')).toEqual({});
    expect(applyReceiverByDestination(customer, 'HAN')).toEqual({});
  });

  it('only uses receiver fields from the HCM warehouse section', () => {
    expect(applyReceiverByDestination({
      ...customer,
      receiver_hcm: null,
      contact_person: 'Liên hệ chung',
    }, 'HCM')).toMatchObject({
      nguoiNhan: '',
      dienThoaiNhan: '0934455122',
      diaChiNhan: '129 Trần Đại Nghĩa, Bình Chánh, Hồ Chí Minh',
    });
  });

  it('does not copy a receiver phone into an empty customer phone', () => {
    const patch = customerToOrderPatch({
      ...customer,
      mobile: null,
      phone_landline: null,
    });

    expect(patch.dienThoaiKh).toBe('');
    expect(patch.dienThoaiNhan).toBeUndefined();
  });

  it('leaves sender address blank when a legacy profile repeats the customer name', () => {
    const patch = customerToOrderPatch({
      ...customer,
      name: 'A Đào',
      short_name: 'A Đào',
      address: '  A Đào  ',
    });

    expect(patch.nguoiGui).toBe('A Đào');
    expect(patch.diaChiGui).toBe('');
  });

  it('uses a real sender address and never writes customer metadata into order notes', () => {
    const patch = customerToOrderPatch({
      ...customer,
      address: '10 Nguyễn Huệ, Hà Nội',
      price_table: 'Tiêu chuẩn 72h',
      email: 'khach@example.com',
    });

    expect(patch.diaChiGui).toBe('10 Nguyễn Huệ, Hà Nội');
    expect(patch.ghiChu).toBeUndefined();
  });

  it('autofills the saved default province without changing the destination HUB', () => {
    const patch = customerToOrderPatch(customer);

    expect(patch.huyen).toBe('Hồ Chí Minh');
    expect(patch.destHubId).toBeUndefined();
    expect(patch.noiDen).toBeUndefined();
  });

  it('applies editable bill defaults from the customer profile', () => {
    const patch = customerToOrderPatch({
      ...customer,
      default_service: 'Nhanh 48h',
      default_delivery_method: 'Lấy tại kho',
      default_billing_unit: 'Khối',
      default_payment_method: 'Người nhận thanh toán',
      default_special_goods: 'HIGH_VALUE,FRAGILE',
    });

    expect(patch).toMatchObject({
      dichVu: 'Nhanh 48h',
      giaoHang: 'Lấy tại kho',
      donGiaDonVi: 'Khối',
      phuongThuc: 'Người nhận thanh toán',
      specialGoods: ['HIGH_VALUE', 'FRAGILE'],
    });
    expect(patch.giamGia).toBeUndefined();
  });

  it('clears unchanged HCM autofill when the order province changes', () => {
    const form = {
      ...emptyOrderForm(),
      huyen: 'HCM',
      ...applyReceiverByDestination(customer, 'HCM'),
    };
    const next = {
      ...form,
      huyen: 'Đà Nẵng',
      ...receiverPatchForProvinceChange(customer, form, 'Đà Nẵng'),
    };

    expect(next.nguoiNhan).toBe('');
    expect(next.dienThoaiNhan).toBe('');
    expect(next.diaChiNhan).toBe('');
    expect(next.quanHuyen).toBe('');
    expect(next.phuongXa).toBe('');
  });

  it('preserves receiver details entered manually for a non-HCM order', () => {
    const form = {
      ...emptyOrderForm(),
      huyen: 'HCM',
      ...applyReceiverByDestination(customer, 'HCM'),
      diaChiNhan: '25 Nguyễn Văn Linh, Đà Nẵng',
    };
    const next = {
      ...form,
      huyen: 'Đà Nẵng',
      ...receiverPatchForProvinceChange(customer, form, 'Đà Nẵng'),
    };

    expect(next.diaChiNhan).toBe('25 Nguyễn Văn Linh, Đà Nẵng');
  });
});
