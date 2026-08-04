import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import WaybillInvoiceTemplate from './WaybillInvoiceTemplate';
import type { WaybillPrintData } from './waybillPrintUtils';

const printData: WaybillPrintData = {
  waybillCode: 'ECO-HAN-108964',
  maKhGui: 'ADAO',
  maBcGui: 'HAN',
  tenKhGui: 'A Đào',
  diaChiGui: 'Hà Nội',
  quanHuyenGui: '',
  tinhGui: 'HAN',
  sdtGui: '0901111222',
  maBcNhan: 'HCM',
  tenCongTyNhan: 'CÔNG TY NHẬN HÀNG',
  tenLienHeNhan: 'Nguyễn Văn Nhận',
  diaChiNhan: '129 Trần Đại Nghĩa',
  quanHuyenNhan: 'Bình Chánh',
  phuongXaNhan: 'Xã Tân Kiên',
  tinhNhan: 'HCM',
  sdtNhan: '0938938112',
  moTaHang: 'Mã PK',
  soKien: '1',
  trongLuong: '10',
  tongLuong: '2.00',
  ghiChu: '',
  noiDungHang: 'Mã PK',
  hinhThucThanhToan: 'CÔNG NỢ THÁNG',
  thuHo: '0',
  khaiGia: 'Không',
  ngayGuiDon: '20/07/2026',
  cuocChinh: '',
  dichVuCongThem: '',
  tongCuoc: '',
  tongPhaiThuPhat: '0',
  dichVu: 'TIÊU CHUẨN 72H',
  dvGtgt: 'Tiêu chuẩn',
  codStamp: false,
  showPricing: false,
};

describe('waybill invoice layout', () => {
  it('keeps the barcode code, uses the requested hotline, and removes sender phone', () => {
    const html = renderToStaticMarkup(<WaybillInvoiceTemplate data={printData} />);

    expect(html).toContain('ECOHAN108964');
    expect(html).toContain('text=ECOHAN108964');
    expect(html).toContain('eco-phone-numbers');
    expect(html.match(/0946 936 999/g)).toHaveLength(1);
    expect(html.match(/0888\.805\.625/g)).toHaveLength(1);
    expect(html).not.toContain('0969 444 816');
    expect(html).toContain('eco-band--receiver-summary');
    expect(html).not.toContain('eco-band--receiver-summary eco-band--top');
    expect(html).toContain('Tên công ty nhận:');
    expect(html).toContain('CÔNG TY NHẬN HÀNG');
    expect(html).toContain('eco-two-col-line--receiver-contact');
    expect(html).toContain('eco-recipient-phone');
    expect(html).toContain('Tên liên hệ:');
    expect(html).toContain('Phường/Xã:');
    expect(html).toContain('Xã Tân Kiên');
    const receiverContact = html.match(/eco-two-col-line--receiver-contact[\s\S]*?<\/div><\/div>/)?.[0] || '';
    expect(receiverContact.indexOf('Số điện thoại:')).toBeLessThan(receiverContact.indexOf('Tên liên hệ:'));
    expect(html).toContain('Nguyễn Văn Nhận');
    expect(html.match(/0938938112/g)).toHaveLength(1);
    expect(html).not.toContain('Mã KH nhận:');
    expect(html).not.toContain('0901111222');
  });

  it('separates charge details, total amount and the send-date row into stable layout blocks', () => {
    const html = renderToStaticMarkup(<WaybillInvoiceTemplate data={printData} />);

    expect(html).toContain('eco-charge-lines');
    expect(html).toContain('eco-total-label');
    expect(html).toContain('eco-total-value');
    expect(html).toContain('eco-extra-info-box--cod');
    expect(html).toContain('eco-extra-info-box--declared-value');
    expect(html).toContain('eco-sign-date');
    expect(html).not.toContain('Ngày giờ gửi&nbsp;');
    expect(html.match(/eco-charge-value/g)).toHaveLength(2);
  });
});
