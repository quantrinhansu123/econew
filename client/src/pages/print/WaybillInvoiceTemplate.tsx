import { useLayoutEffect, useRef, type ReactNode } from 'react';
import {
  fitWaybillInvoiceElement,
  normalizeWaybillPrintCode,
  type WaybillPrintData,
} from './waybillPrintUtils';

export const WAYBILL_PRINT_LOGO_SRC = '/z7901426682318_7c6139835f49e94fff8a3f239aaea0b8.jpg';

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
      <strong>{value}</strong>
    </div>
  );
}

export default function WaybillInvoiceTemplate({ data }: Props) {
  const invoiceRef = useRef<HTMLElement>(null);
  const displayWaybillCode = normalizeWaybillPrintCode(data.waybillCode);
  const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(displayWaybillCode)}&scale=2&height=10&includetext=false`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(displayWaybillCode)}`;
  const hasPricing = data.showPricing;

  useLayoutEffect(() => {
    if (invoiceRef.current) fitWaybillInvoiceElement(invoiceRef.current);
  }, [data]);

  return (
    <div className="waybill-invoice-frame">
      <section ref={invoiceRef} className="waybill-invoice eco-a5-template">
      <header className="eco-a5-header">
        <div className="eco-a5-brand">
          <img src={WAYBILL_PRINT_LOGO_SRC} alt="" className="eco-logo" />
          <div className="eco-phone">
            <span className="eco-phone-label">Hotline</span>
            0946 936 999<br />0969 444 816
          </div>
        </div>
        <div className="eco-a5-title">
          <h1>VẬN TẢI ECO</h1>
          <h2>VẬN CHUYỂN HÀNG HÓA BẮC - NAM</h2>
        </div>
        <div className="eco-a5-barcode">
          <img src={barcodeUrl} alt="" className="eco-barcode-img" />
          <div className="eco-code">{displayWaybillCode}</div>
          <div className="eco-code-meta">
            <span>Mã KH nhận:</span>
            <span>Mã BC nhận: <b>{value(data.maBcNhan)}</b></span>
          </div>
        </div>
      </header>

      <div className="eco-a5-row eco-a5-people-row">
        <div className="eco-band eco-band--codes">
          <MiniLine label="Mã KH gửi:" strong>{value(data.maKhGui)}</MiniLine>
          <MiniLine label="Mã BC gửi:" strong>{value(data.maBcGui)}</MiniLine>
        </div>
        <div className="eco-band">
          <MiniLine label="Tên khách nhận:" strong>{value(data.tenKhNhan)}</MiniLine>
        </div>
        <div className="eco-band">
          <MiniLine label="Tên khách gửi:" strong>{value(data.tenKhGui)}</MiniLine>
          <MiniLine label="Địa chỉ:" className="eco-mini-line--address">{value(data.diaChiGui)}</MiniLine>
        </div>
        <div className="eco-band">
          <MiniLine label="Địa chỉ:" className="eco-mini-line--address">{value(data.diaChiNhan)}</MiniLine>
        </div>
        <div className="eco-band">
          <div className="eco-two-col-line">
            <MiniLine label="Quận/Huyện:">{value(data.quanHuyenGui)}</MiniLine>
            <MiniLine label="Tỉnh/TP:" strong>{value(data.tinhGui)}</MiniLine>
          </div>
        </div>
        <div className="eco-band">
          <div className="eco-two-col-line eco-two-col-line--dest">
            <MiniLine label="Quận/Huyện:" strong>{value(data.tinhNhan)}</MiniLine>
            <MiniLine label="Tỉnh/TP:" strong>{value(data.maBcNhan)}</MiniLine>
          </div>
        </div>
        <div className="eco-band">
          <div className="eco-two-col-line">
            <MiniLine label="Số điện thoại:" strong>{value(data.sdtGui)}</MiniLine>
            <MiniLine label="Tên liên hệ:">{' '}</MiniLine>
          </div>
        </div>
        <div className="eco-band">
          <div className="eco-two-col-line">
            <MiniLine label="Số điện thoại:" strong>{value(data.sdtNhan)}</MiniLine>
            <MiniLine label="Tên liên hệ:">{' '}</MiniLine>
          </div>
        </div>
      </div>

      <div className="eco-a5-row eco-a5-main-row">
        <div className="eco-a5-left-panel">
          <div className="eco-a5-goods-code"><b>Mô tả hàng hoá:</b> {value(data.noiDungHang)}</div>
          <div className="eco-stats-grid">
            <StatCell label="Số kiện" value={data.soKien} />
            <StatCell label="Trọng lượng thực" value={data.trongLuong} />
            <StatCell label="Trọng lượng quy đổi" value={data.tongLuong} />
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
            <div className="eco-charge-line"><span>Cước chính:</span><b>{hasPricing ? value(data.cuocChinh) : ' '}</b></div>
            <div className="eco-charge-line"><span>Dịch vụ cộng thêm:</span><b>{hasPricing ? value(data.dichVuCongThem) : ' '}</b></div>
            <div className="eco-charge-line"><span>Tổng cước:</span><b>{hasPricing ? value(data.tongCuoc) : ' '}</b></div>
            <div className="eco-total">
              <span className="eco-total-label">Tổng phải thu khi phát thư</span>
              <strong>{value(data.tongPhaiThuPhat)}</strong>
            </div>
          </div>
          <div className="eco-extra-info-box"><p><span className="eco-extra-label">Thu hộ:</span><b>{data.thuHo || '0'}</b></p></div>
          <div className="eco-extra-info-box"><p><span className="eco-extra-label">Khai giá:</span><b>{data.khaiGia}</b></p></div>
          <div className="eco-sign-box eco-sign-sender">
            <b>Ngày giờ gửi&nbsp;&nbsp;{value(data.ngayGuiDon)}</b>
            <p>Họ tên và chữ ký người gửi</p>
          </div>
          <div className="eco-sign-box eco-sign-receiver">
            <b>Ngày giờ nhận</b>
            <p>Họ tên và chữ ký người nhận</p>
          </div>
        </div>
      </div>

      <footer className="eco-a5-footer">
        <div className="eco-footer-service">
          <div className="eco-footer-text">
            <p><b>Dịch vụ:</b> {value(data.dichVu)}</p>
            <p><b>D.vụ GTGT:</b> {value(data.dvGtgt)}</p>
            <p><i>Quý khách vui lòng quét mã QR để xem chính sách đền bù và điều kiện chuyển phát</i></p>
          </div>
          <div className="eco-qr"><img src={qrUrl} alt="QR" /></div>
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
    </div>
  );
}
