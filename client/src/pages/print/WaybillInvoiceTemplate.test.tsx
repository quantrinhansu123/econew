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
  sdtNhan: '0938 938 112',
  moTaHang: 'Mã PK',
  giaoHang: 'Nhận tại kho ECO',
  soKien: '1',
  trongLuongQuyDoi: '10.00',
  cbm: '2.00',
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
    expect(html).toContain('scale=4');
    expect(html).toContain('eco-phone-numbers');
    expect(html.match(/0946 936 999/g)).toHaveLength(1);
    expect(html.match(/0869 444 816/g)).toHaveLength(1);
    expect(html).not.toContain('0888.805.625');
    expect(html).not.toContain('D.vụ GTGT:');
    expect(html).toContain('eco-band--receiver-summary');
    expect(html).not.toContain('eco-band--receiver-summary eco-band--top');
    expect(html).toContain('Tên công ty nhận:');
    expect(html).toContain('CÔNG TY NHẬN HÀNG');
    expect(html).toContain('eco-origin-code');
    expect(html).toContain('<span class="eco-mini-label">Tên khách gửi:</span><span class="eco-mini-value">A Đào</span>');
    expect(html).toContain('eco-two-col-line--receiver-contact');
    expect(html).toContain('eco-recipient-phone');
    expect(html).toContain('Tên liên hệ:');
    expect(html).toContain('Phường/Xã:');
    expect(html).toContain('Xã Tân Kiên');
    expect(html).toContain('Quận/Huyện:');
    expect(html).toContain('Bình Chánh');
    expect(html.indexOf('Phường/Xã:')).toBeLessThan(html.indexOf('Quận/Huyện:'));
    const receiverContact = html.match(/eco-two-col-line--receiver-contact[\s\S]*?<\/div><\/div>/)?.[0] || '';
    expect(receiverContact.indexOf('Số điện thoại:')).toBeLessThan(receiverContact.indexOf('Tên liên hệ:'));
    expect(html).toContain('Nguyễn Văn Nhận');
    expect(html).toContain('<span class="eco-mini-label">Tên liên hệ:</span><span class="eco-mini-value">Nguyễn Văn Nhận</span>');
    expect(html.match(/0938 938 112/g)).toHaveLength(1);
    expect(html).not.toContain('Mã KH nhận:');
    expect(html).not.toContain('0901111222');
    expect(html).not.toContain('Trọng lượng thực');
    expect(html).toContain('<b>Giao hàng:</b> Nhận tại kho ECO');
    expect(html).not.toContain('<b>Mô tả hàng hoá:</b>');
    expect(html).toContain('Trọng lượng quy đổi');
    expect(html).toContain('CBM');
    expect(html).toContain('<span class="eco-stat-value">10.00</span>');
    expect(html).not.toContain('<strong>10.00</strong>');
    expect(html.match(/Mã BC gửi:/g)).toHaveLength(1);
    expect(html).toContain('/eco-policy-qr.jpg');
    expect(html).not.toContain('api.qrserver.com');
  });

  it('keeps charge details and the collection total without a separator bar', () => {
    const html = renderToStaticMarkup(<WaybillInvoiceTemplate data={printData} />);

    expect(html).toContain('eco-charge-lines');
    expect(html).toContain('eco-total');
    expect(html).toContain('Tổng phải thu khi phát thư');
    expect(html).toContain('<strong class="eco-total-value">0</strong>');
    expect(html).toContain('eco-extra-info-box--cod');
    expect(html).toContain('eco-extra-info-box--declared-value');
    expect(html).toContain('eco-sign-date');
    expect(html).not.toContain('Ngày giờ gửi&nbsp;');
    expect(html.match(/eco-charge-value/g)).toHaveLength(2);
  });
});
