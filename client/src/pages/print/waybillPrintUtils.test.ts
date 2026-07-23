import { describe, expect, it } from 'vitest';
import type { WaybillDetail } from '../warehouse/orders/types';
import { buildWaybillPrintData } from './waybillPrintUtils';

const waybill = (overrides: Partial<WaybillDetail> = {}): WaybillDetail => ({
  id: '108964',
  waybill_code: 'ECOHAN108964',
  sender_info: 'A Đào | 0901111222 | Hà Nội',
  sender_phone: '0901111222',
  receiver_info: 'Nguyễn Văn Nhận | 0938938112 | 129 Trần Đại Nghĩa',
  receiver_phone: '0938938112',
  receiver_address: '129 Trần Đại Nghĩa',
  receiver_company_name: 'CÔNG TY NHẬN HÀNG',
  dest_hub: { id: '2', code: 'HCM', name: 'Bưu cục Hồ Chí Minh', province: 'Hồ Chí Minh' },
  origin_hub: { id: '1', code: 'HAN', name: 'Hà Nội' },
  package_count: 1,
  weight: 10,
  ...overrides,
});

describe('buildWaybillPrintData receiver fields', () => {
  it('keeps company, contact name, phone and destination hub code separate', () => {
    const data = buildWaybillPrintData(waybill());

    expect(data.tenCongTyNhan).toBe('CÔNG TY NHẬN HÀNG');
    expect(data.tenLienHeNhan).toBe('Nguyễn Văn Nhận');
    expect(data.sdtNhan).toBe('0938938112');
    expect(data.maBcNhan).toBe('HCM');
  });

  it('prints the destination HUB code separately from the final delivery address', () => {
    const data = buildWaybillPrintData(waybill({
      noi_den: 'Khánh Hòa',
      receiver_address: '12 Lê Hồng Phong, Nha Trang, Khánh Hòa',
      note: 'tinh_den=Khánh Hòa | quan_huyen=Nha Trang',
    }));

    expect(data.maBcNhan).toBe('HCM');
    expect(data.quanHuyenNhan).toBe('Nha Trang');
    expect(data.tinhNhan).toBe('Khánh Hòa');
  });

  it('does not put the receiver phone into the company-name field for legacy bills', () => {
    const data = buildWaybillPrintData(waybill({ receiver_company_name: null }));

    expect(data.tenCongTyNhan).toBe('');
    expect(data.tenLienHeNhan).toBe('Nguyễn Văn Nhận');
    expect(data.sdtNhan).toBe('0938938112');
  });

  it('does not mistake an unprefixed ward for the receiver province', () => {
    const data = buildWaybillPrintData(waybill({
      receiver_address: '165 Thạch Xuân, Thới An',
      noi_den: null,
      note: 'ma_kh=KHACHLE | content=PK008786',
    }));

    expect(data.quanHuyenNhan).toBe('');
    expect(data.tinhNhan).toBe('Hồ Chí Minh');
  });

  it('prints the exact user note and hides technical metadata', () => {
    const userNote = 'Gọi trước | mã=ABC\nGiao cửa sau';
    const data = buildWaybillPrintData(waybill({
      note: [
        'ma_kh=ABC',
        'receiver_company_name=Công ty cũ',
        `user_note=${encodeURIComponent(userNote)}`,
      ].join(' | '),
    }));

    expect(data.ghiChu).toBe(userNote);
    expect(data.ghiChu).not.toContain('receiver_company_name=');
  });

  it('keeps handwritten notes on legacy bills while stripping company metadata', () => {
    const data = buildWaybillPrintData(waybill({
      note: 'receiver_company_name=Công ty cũ | Giao giờ hành chính',
    }));

    expect(data.ghiChu).toBe('Giao giờ hành chính');
  });
});
