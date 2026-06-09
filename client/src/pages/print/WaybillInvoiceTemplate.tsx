import type { ReactNode } from 'react';
import type { WaybillPrintData } from './waybillPrintUtils';

export const WAYBILL_PRINT_LOGO_SRC = '/z7901426682318_7c6139835f49e94fff8a3f239aaea0b8.jpg';

interface Props {
  data: WaybillPrintData;
}

const value = (text?: string) => text || '\u00A0';

function InfoLine({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="eco-line">
      <div className="eco-label">{label}</div>
      <div>{children ?? '\u00A0'}</div>
    </div>
  );
}

export default function WaybillInvoiceTemplate({ data }: Props) {
  const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(data.waybillCode)}&scale=2&height=10&includetext=false`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(data.waybillCode)}`;
  const hasPricing = data.showPricing;

  return (
    <section className="waybill-invoice">
      <header className="eco-header">
        <div className="eco-header-left">
          <img src={WAYBILL_PRINT_LOGO_SRC} alt="" className="eco-logo" />
          <div className="eco-company-small">Express &amp; Exacting</div>
          <div className="eco-phone">0969444816</div>
        </div>

        <div className="eco-header-center">
          <h1>VẬN TẢI ECO</h1>
          <h2>VẬN CHUYỂN HÀNG HÓA BẮC - NAM</h2>
        </div>

        <div className="eco-header-right">
          <img src={barcodeUrl} alt="" className="eco-barcode-img" />
          <div className="eco-code">{data.waybillCode}</div>
          <div className="eco-ma-bc-nhan">Mã BC nhận: {value(data.maBcNhan)}</div>
        </div>
      </header>

      <div className="eco-info">
        <div className="eco-box">
          <div className="eco-box-title">THÔNG TIN NGƯỜI GỬI</div>
          <InfoLine label="Mã KH gửi:">{value(data.maKhGui)}</InfoLine>
          <InfoLine label="Mã BC gửi:">{value(data.maBcGui)}</InfoLine>
          <InfoLine label="Tên khách gửi:">{value(data.tenKhGui)}</InfoLine>
          <InfoLine label="Địa chỉ:">{value(data.diaChiGui)}</InfoLine>
          <InfoLine label="Quận/Huyện:">{value(data.quanHuyenGui)}</InfoLine>
          <InfoLine label="Tỉnh/TP:">{value(data.tinhGui)}</InfoLine>
          <InfoLine label="Số điện thoại:">{value(data.sdtGui)}</InfoLine>
        </div>

        <div className="eco-box">
          <div className="eco-box-title">THÔNG TIN NGƯỜI NHẬN</div>
          <InfoLine label="Tên khách nhận:">{value(data.tenKhNhan)}</InfoLine>
          <InfoLine label="Địa chỉ:">{value(data.diaChiNhan)}</InfoLine>
          <InfoLine label="Tỉnh/TP:">{value(data.tinhNhan)}</InfoLine>
          <InfoLine label="Số điện thoại:">{value(data.sdtNhan)}</InfoLine>
        </div>
      </div>

      <div className="eco-product">
        <div className="eco-product-box">
          <b>Mô tả hàng hóa</b>
          <p className="eco-product-gap">{value(data.moTaHang)}</p>
          <p>
            Số kiện: <strong>{data.soKien}</strong>
          </p>
          <p className="eco-product-gap">
            Trọng lượng:
            <span className="eco-metric">
              <span className="eco-metric-value">{data.trongLuong}</span>
              <span className="eco-metric-unit">Kg</span>
            </span>
          </p>
        </div>

        <div className="eco-product-box">
          <b>Khối lượng</b>
          <p className="eco-product-gap">
            Trọng lượng hàng:
            <span className="eco-metric">
              <span className="eco-metric-value">{data.tongLuong}</span>
              <span className="eco-metric-unit">M3</span>
            </span>
          </p>
        </div>

        <div className="eco-product-box">
          <b>Thanh toán</b>
          <p className="eco-product-gap">Hình thức thanh toán:</p>
          <p>
            <strong>{value(data.hinhThucThanhToan)}</strong>
          </p>
        </div>
      </div>

      <div className="eco-payment">
        <div className="eco-pay-box">
          <b>Ghi chú</b>
          <p className="eco-product-gap">{value(data.ghiChu)}</p>
          {data.codStamp && <div className="eco-cod-stamp">THU COD</div>}
        </div>

        <div className="eco-pay-box">
          <b>Thông tin hàng hóa</b>
          <p className="eco-product-gap">Thu hộ: {data.thuHo || '0'}</p>
          <p>Khai giá: {data.khaiGia}</p>
          <p className="eco-product-gap">Ngày gửi đơn: {value(data.ngayGuiDon)}</p>
          <p>{value(data.noiDungHang)}</p>
        </div>

        <div className="eco-pay-box">
          <p>Cước chính: {hasPricing ? value(data.cuocChinh) : '\u00A0'}</p>
          <p className="eco-product-gap">Dịch vụ cộng thêm: {hasPricing ? value(data.dichVuCongThem) : '\u00A0'}</p>
          <p>Tổng cước: {hasPricing ? value(data.tongCuoc) : '\u00A0'}</p>
          <div className="eco-total">
            <span className="eco-total-label">Tổng phải thu khi phát thư</span>
            <strong>{value(data.tongPhaiThuPhat)}</strong>
          </div>
        </div>
      </div>

      <footer className="eco-footer">
        <div className="eco-footer-box eco-footer-service">
          <div className="eco-footer-service-row">
            <div className="eco-footer-text">
              <p>
                <b>Dịch vụ:</b> {value(data.dichVu)}
              </p>
              <p>
                <b>P.vụ/tgt:</b> {value(data.dvGtgt)}
              </p>
            </div>
            <div className="eco-qr">
              <img src={qrUrl} alt="QR" />
            </div>
          </div>
        </div>

        <div className="eco-footer-box">
          <b>Mã nhân viên nhận</b>
        </div>

        <div className="eco-footer-box">
          <b>Ngày giờ nhận</b>
          <p className="eco-product-gap">Họ tên và chữ ký người nhận</p>
        </div>
      </footer>
    </section>
  );
}
