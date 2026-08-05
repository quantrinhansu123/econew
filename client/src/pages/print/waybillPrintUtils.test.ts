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
      note: 'tinh_den=Khánh Hòa | quan_huyen=Nha Trang | phuong_xa=Phước Hải',
    }));

    expect(data.maBcNhan).toBe('HCM');
    expect(data.quanHuyenNhan).toBe('Nha Trang');
    expect(data.phuongXaNhan).toBe('Phước Hải');
    expect(data.tinhNhan).toBe('Khánh Hòa');
  });

  it('extracts the ward from an old address and formats a compact province code', () => {
    const data = buildWaybillPrintData(waybill({
      receiver_address: 'Thửa đất số 1537, Phường Tân Định, Thị Xã Bến Cát, Tỉnh Bình Dương',
      note: 'tinh_den=BINHDUONG',
    }));

    expect(data.phuongXaNhan).toBe('Phường Tân Định');
    expect(data.tinhNhan).toBe('Bình Dương');
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

  it('prints selected special goods inside the note area', () => {
    const data = buildWaybillPrintData(waybill({
      note: 'special_goods=RETURN_DOCUMENTS,OVERSIZED,LIQUID',
    }));

    expect(data.ghiChu).toBe(
      'Tính chất HH đặc biệt: Hoàn chứng từ gốc đi kèm, Quá khổ, Chất lỏng',
    );
  });

  it('prints normalized goods content even when legacy note metadata is absent', () => {
    const data = buildWaybillPrintData(waybill({
      noi_dung: 'TZ-10-2; TZ-15-2',
      note: '',
    }));

    expect(data.noiDungHang).toBe('TZ-10-2; TZ-15-2');
    expect(data.moTaHang).toBe('TZ-10-2; TZ-15-2');
  });

  it('prints the selected send date instead of the record creation timestamp', () => {
    const data = buildWaybillPrintData(waybill({
      created_at: '2026-07-26T10:00:00+07:00',
      note: 'ngay_gui=2026-07-22',
    }));

    expect(data.ngayGuiDon).toBe('22/07/2026');
  });

  it('shows freight and collects COD plus freight when the pricing toggle is enabled', () => {
    const data = buildWaybillPrintData(waybill({
      payment_type: 'CC',
      freight_amount: 532_000,
      cod_amount: 500_000,
      note: 'phuong_thuc=Người nhận thanh toán | thanh_toan=999',
    }), true);

    expect(data.showPricing).toBe(true);
    expect(data.cuocChinh).toBe('532.000 đ');
    expect(data.tongCuoc).toBe('532.000 đ');
    expect(data.tongPhaiThuPhat).toBe('1,032,000');
  });

  it('automatically shows freight for receiver-paid bills when the user has pricing access', () => {
    const data = buildWaybillPrintData(waybill({
      payment_type: 'CC',
      freight_amount: 532_000,
      cod_amount: 500_000,
      note: 'phuong_thuc=Người nhận thanh toán',
    }), false, true);

    expect(data.showPricing).toBe(true);
    expect(data.cuocChinh).toBe('532.000 đ');
    expect(data.tongCuoc).toBe('532.000 đ');
    expect(data.tongPhaiThuPhat).toBe('1,032,000');
  });

  it('uses COD plus freight when a receiver-paid legacy bill has no stored total', () => {
    const data = buildWaybillPrintData(waybill({
      payment_type: 'CC',
      freight_amount: 532_000,
      cod_amount: 500_000,
      note: 'phuong_thuc=Người nhận thanh toán',
    }));

    expect(data.tongPhaiThuPhat).toBe('1,032,000');
  });

  it('keeps freight hidden from receiver-paid bills when the pricing toggle is off', () => {
    const data = buildWaybillPrintData(waybill({
      payment_type: 'CC',
      freight_amount: 532_000,
      cod_amount: 500_000,
      note: 'phuong_thuc=Người nhận thanh toán | thanh_toan=1032000',
    }));

    expect(data.showPricing).toBe(false);
    expect(data.cuocChinh).toBe('');
    expect(data.tongCuoc).toBe('');
    expect(data.tongPhaiThuPhat).toBe('1,032,000');
  });

  it('falls back to the stored collection total when protected amount columns are absent', () => {
    const data = buildWaybillPrintData(waybill({
      payment_type: 'CC',
      note: 'phuong_thuc=Người nhận thanh toán | thanh_toan=1032000',
    }));

    expect(data.tongPhaiThuPhat).toBe('1,032,000');
  });

  it('does not treat a note-backed cash payment as receiver-paid', () => {
    const data = buildWaybillPrintData(waybill({
      payment_type: 'CC',
      freight_amount: 532_000,
      cod_amount: 500_000,
      note: 'phuong_thuc=Tiền mặt | thanh_toan=532000',
    }), false, true);

    expect(data.showPricing).toBe(false);
    expect(data.tongPhaiThuPhat).toBe('500,000');
  });
});
