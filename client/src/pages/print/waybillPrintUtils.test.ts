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
  dest_hub: { id: '2', code: 'HCM', name: 'Hồ Chí Minh' },
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
});
