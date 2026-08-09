import type { ReactNode } from 'react';
import type { WaybillPrintData } from './waybillPrintUtils';

export const WAYBILL_PRINT_LOGO_SRC = '/z7901426682318_7c6139835f49e94fff8a3f239aaea0b8.jpg';
export const WAYBILL_POLICY_QR_SRC = '/eco-policy-qr.jpg';

interface Props {
  data: WaybillPrintData;
}

const value = (text?: string) => text || ' ';

function MiniLine({ label, children, strong, className = '' }: { label: string; children?: ReactNode; strong?: boolean; className?: string }) {
  return (
    <div className={`eco-mini-line ${className}`.trim()}>
      <span className="eco-mini-label">{label}</span>
      <span className={strong ? 'eco-mini-value eco-mini-value--strong' : 'eco-mini-value'}>{children ?? ' '}</span>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="eco-stat-cell">
      <div>{label}</div>
      <span className="eco-stat-value">{value}</span>
    </div>
  );
}

export default function WaybillInvoiceTemplate({ data }: Props) {
  const displayWaybillCode = data.waybillCode.replace(/[\s-]+/g, '');
  const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(displayWaybillCode)}&scale=4&height=12&includetext=false`;
  const hasPricing = data.showPricing;

  return (
    <section className="waybill-invoice eco-a5-template">
      <header className="eco-a5-header">
        <div className="eco-a5-brand">
          <img src={WAYBILL_PRINT_LOGO_SRC} alt="" className="eco-logo" />
          <div className="eco-phone">
            <span className="eco-phone-label">Hotline</span>{' '}
            <span className="eco-phone-numbers">0946 936 999 - 0869 444 816</span>
          </div>
        </div>
        <div className="eco-a5-title">
          <h1>VẬN TẢI ECO</h1>
          <h2>VẬN CHUYỂN HÀNG HÓA BẮC - NAM</h2>
          <div className="eco-origin-code eco-header-post-code">Mã BC gửi: <b>{value(data.maBcGui)}</b></div>
        </div>
        <div className="eco-a5-barcode">
          <img src={barcodeUrl} alt="" className="eco-barcode-img" />
          <div className="eco-code">{displayWaybillCode}</div>
          <div className="eco-code-meta eco-header-post-code">
            <span>Mã BC nhận: <b>{value(data.maBcNhan)}</b></span>
          </div>
        </div>
      </header>

      <div className="eco-a5-row eco-a5-people-row">
        <div className="eco-band eco-band--codes eco-band--left eco-band--top">
          <MiniLine label="Mã KH gửi:" strong>{value(data.maKhGui)}</MiniLine>
        </div>
        <div className="eco-band eco-band--receiver-summary">
          <div className="eco-recipient-summary">
            <MiniLine label="Tên công ty nhận:" strong>{value(data.tenCongTyNhan)}</MiniLine>
          </div>
        </div>
        <div className="eco-band eco-band--sender-details eco-band--left">
          <MiniLine label="Tên khách gửi:">{value(data.tenKhGui)}</MiniLine>
          <MiniLine label="Địa chỉ:" className="eco-mini-line--address">{value(data.diaChiGui)}</MiniLine>
        </div>
        <div className="eco-band eco-band--receiver-details">
          <MiniLine label="Địa chỉ:" className="eco-mini-line--address">{value(data.diaChiNhan)}</MiniLine>
          <MiniLine label="Phường/Xã:" strong className="eco-mini-line--ward">{value(data.phuongXaNhan)}</MiniLine>
        </div>
        <div className="eco-band eco-band--sender-region eco-band--left">
          <div className="eco-two-col-line">
            <MiniLine label="Quận/Huyện:">{value(data.quanHuyenGui)}</MiniLine>
            <MiniLine label="Tỉnh/TP:">{value(data.tinhGui)}</MiniLine>
          </div>
        </div>
        <div className="eco-band eco-band--receiver-region">
          <div className="eco-two-col-line eco-two-col-line--dest">
            <MiniLine label="Quận/Huyện:" strong>{value(data.quanHuyenNhan)}</MiniLine>
            <MiniLine label="Tỉnh/TP:" strong>{value(data.tinhNhan)}</MiniLine>
          </div>
        </div>
        <div className="eco-band eco-band--sender-contact eco-band--left">
          <div className="eco-two-col-line eco-two-col-line--sender-contact">
            <MiniLine label="Tên liên hệ:">{' '}</MiniLine>
          </div>
        </div>
        <div className="eco-band eco-band--receiver-contact">
          <div className="eco-two-col-line eco-two-col-line--receiver-contact">
            <MiniLine label="Số điện thoại:" strong className="eco-recipient-phone">{value(data.sdtNhan)}</MiniLine>
            <MiniLine label="Tên liên hệ:">{value(data.tenLienHeNhan)}</MiniLine>
          </div>
        </div>
      </div>

      <div className="eco-a5-row eco-a5-main-row">
        <div className="eco-a5-left-panel">
          <div className="eco-a5-goods-code"><b>Giao hàng:</b> {value(data.giaoHang)}</div>
          <div className="eco-stats-grid">
            <StatCell label="Số kiện" value={data.soKien} />
            <StatCell label="Trọng lượng quy đổi" value={data.trongLuongQuyDoi} />
            <StatCell label="CBM" value={data.cbm} />
          </div>
          <div className="eco-note-grid">
            <div className="eco-note-cell">
              <span className="eco-note-heading">Ghi chú</span>
              <p>{value(data.ghiChu)}</p>
              {data.codStamp && <div className="eco-cod-stamp">THU COD</div>}
            </div>
            <div className="eco-note-cell eco-note-cell--contents">
              <span className="eco-note-heading">Nội dung hàng hoá</span>
              <p>{value(data.noiDungHang)}</p>
            </div>
          </div>
        </div>

        <div className="eco-a5-right-panel">
          <div className="eco-payment-method-box">
            <div>Hình thức thanh toán:</div>
            <strong>{value(data.hinhThucThanhToan)}</strong>
          </div>
          <div className="eco-charge-box">
            <div className="eco-charge-lines">
              <div className="eco-charge-line"><span>Cước chính:</span><span className="eco-charge-value">{hasPricing ? value(data.cuocChinh) : ' '}</span></div>
              <div className="eco-charge-line"><span>Dịch vụ cộng thêm:</span><b>{hasPricing ? value(data.dichVuCongThem) : ' '}</b></div>
              <div className="eco-charge-line"><span>Tổng cước:</span><span className="eco-charge-value">{hasPricing ? value(data.tongCuoc) : ' '}</span></div>
            </div>
            <div className="eco-total">
              <span className="eco-total-label">Tổng phải thu khi phát thư</span>
              <strong className="eco-total-value">{value(data.tongPhaiThuPhat)}</strong>
            </div>
          </div>
          <div className="eco-extra-info-box eco-extra-info-box--cod"><p><span className="eco-extra-label">Thu hộ:</span><b>{data.thuHo || '0'}</b></p></div>
          <div className="eco-extra-info-box eco-extra-info-box--declared-value"><p><span className="eco-extra-label">Khai giá:</span><b>{data.khaiGia}</b></p></div>
          <div className="eco-sign-box eco-sign-sender">
            <div className="eco-sign-date">
              <b>Ngày giờ gửi</b>
              <strong>{value(data.ngayGuiDon)}</strong>
            </div>
            <p>Họ tên và chữ ký người gửi</p>
          </div>
          <div className="eco-sign-box eco-sign-receiver">
            <div className="eco-sign-date">
              <b>Ngày giờ nhận</b>
            </div>
            <p>Họ tên và chữ ký người nhận</p>
          </div>
        </div>
      </div>

      <footer className="eco-a5-footer">
        <div className="eco-footer-service">
          <div className="eco-footer-text">
            <p><b>Dịch vụ:</b> {value(data.dichVu)}</p>
            <p><i>Quý khách vui lòng quét mã QR để xem chính sách đền bù và điều kiện chuyển phát</i></p>
          </div>
          <div className="eco-qr"><img src={WAYBILL_POLICY_QR_SRC} alt="QR chính sách ECO" /></div>
        </div>
        <div className="eco-footer-staff">
          <b>Mã nhân viên nhận</b>
          <label><span /> Chuyển hoàn</label>
        </div>
        <div className="eco-footer-staff">
          <b>Mã nhân viên phát</b>
          <label><span /> Huỷ</label>
        </div>
      </footer>
    </section>
  );
}
