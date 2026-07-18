import type { CustomerRecord } from './customerFormTypes';
import type { NewOrderFormState } from '../orders/orderFormTypes';
import { hubIdFromCode } from '../orders/orderFormUtils';
import type { HubSummary } from '../orders/types';

const str = (v: string | null | undefined) => (v ?? '').trim();

function inferNoiDen(customer: CustomerRecord): string {
  const blob = [
    customer.destination_province,
    customer.region,
    customer.address_hcm,
    customer.address_dng,
    customer.receiver_dng,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/hà nội|ha noi|hanoi|phú thọ|phu tho|hưng yên|hung yen|bắc ninh/.test(blob)) return 'HAN';
  if (/đà nẵng|da nang|dng|quảng ngãi|quang ngai/.test(blob)) return 'DNG';
  if (/bình dương|binh duong|hồ chí minh|ho chi minh|hcm|tp\.?hcm|tphcm/.test(blob)) return 'HCM';
  return '';
}

function mapPhuongThuc(creditType: string | null | undefined): string | undefined {
  const k = str(creditType).toUpperCase();
  if (!k) return undefined;
  if (k === 'K' || k.includes('CÔNG NỢ') || k.includes('CONG NO')) return 'Công nợ tháng';
  if (k.includes('COD')) return 'COD';
  if (k.includes('TM') || k.includes('TIỀN MẶT') || k === 'CC') return 'Tiền mặt';
  if (k.includes('CK') || k.includes('CHUYỂN KHOẢN')) return 'Chuyển khoản';
  return undefined;
}

function mapDichVu(priceTable: string | null | undefined): string | undefined {
  const p = str(priceTable).toLowerCase();
  if (!p) return undefined;
  if (p.includes('48h') || p.includes('nhanh') || p.includes('cpn') || p.includes('bay') || p.includes('hàng không')) {
    return 'Nhanh 48h';
  }
  if (p.includes('chậm') || p.includes('cham') || p.includes('4-6') || p.includes('4–6')) {
    return 'Chậm 4-6 ngày';
  }
  if (p.includes('72h') || p.includes('tiêu chuẩn') || p.includes('tieu chuan') || p.includes('bộ') || p.includes('đường bộ')) {
    return 'Tiêu chuẩn 72h';
  }
  return undefined;
}

function mapLoaiBp(priceTable: string | null | undefined): string | undefined {
  const p = str(priceTable).toUpperCase();
  if (p.includes('CPN')) return 'CPN';
  if (p.includes('HỎA TỐC') || p.includes('HOA TOC')) return 'Hỏa tốc';
  if (p.includes('TIẾT KIỆM') || p.includes('TIET KIEM')) return 'Tiết kiệm';
  return undefined;
}

function mapGiaoHang(addressHcm: string | null | undefined): string | undefined {
  const a = str(addressHcm).toLowerCase();
  if (a.includes('gọi ra lấy') || a.includes('goi ra lay')) return 'Lấy tại kho';
  if (a.includes('tận nơi') || a.includes('tan noi')) return 'Tận nơi';
  return undefined;
}

/** SĐT khách hàng/người gửi — ưu tiên số liên hệ chung, sau đó mới tới số nhận tại kho */
export function customerPhone(customer: CustomerRecord) {
  return str(customer.mobile) || str(customer.phone_landline) || str(customer.phone_hcm) || str(customer.phone_dng);
}

/** Địa chỉ gửi lấy riêng từ cột address, không dùng địa chỉ kho nhận. */
export function customerSenderAddress(customer: CustomerRecord) {
  return str(customer.address);
}

/** Địa chỉ nhận chung chỉ gồm dữ liệu kho nhận, không dùng địa chỉ gửi. */
export function customerReceiverAddress(customer: CustomerRecord) {
  return str(customer.address_hcm) || str(customer.address_dng);
}

function customerReceiverPhone(customer: CustomerRecord) {
  return str(customer.phone_hcm) || str(customer.phone_dng) || str(customer.mobile) || str(customer.phone_landline);
}

/** @deprecated Dùng customerSenderAddress hoặc customerReceiverAddress */
export function customerAddress(customer: CustomerRecord) {
  return customerSenderAddress(customer);
}

function buildGhiChu(customer: CustomerRecord): string {
  return [
    customer.price_table && `Bảng giá: ${customer.price_table}`,
    customer.mechanism && `Cơ chế: ${customer.mechanism}`,
    customer.contract_code && customer.contract_code !== customer.code && `Mã CT: ${customer.contract_code}`,
    customer.email && `Email: ${customer.email}`,
    customer.tax_id && `MST: ${customer.tax_id}`,
    customer.english_name && `Tên TA: ${customer.english_name}`,
    customer.contact_address && `ĐChi LH: ${customer.contact_address}`,
    customer.is_suspended || customer.status === 'SUSPENDED' ? 'KH tạm dừng' : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

/** Tỉnh đến là Hồ Chí Minh (HCM) */
export function isHcmProvince(noiDen: string, huyen = ''): boolean {
  const code = noiDen.trim().toUpperCase();
  if (code === 'HCM') return true;
  const blob = `${noiDen} ${huyen}`.trim().toLowerCase();
  return /hồ chí minh|ho chi minh|tp\.?hcm|tphcm|sài gòn|sai gon/.test(blob);
}

function isDngProvince(noiDen: string, huyen = ''): boolean {
  const code = noiDen.trim().toUpperCase();
  if (code === 'DNG') return true;
  const blob = `${noiDen} ${huyen}`.trim().toLowerCase();
  return /đà nẵng|da nang/.test(blob);
}

/**
 * Điền thông tin người nhận theo tỉnh đến, có fallback về dữ liệu nhận chung đã lưu.
 * ĐC/SĐT HCM hoặc DNG chỉ ưu tiên khi tỉnh đến khớp hub tương ứng.
 */
export function applyReceiverByDestination(
  customer: CustomerRecord,
  noiDen: string,
  huyen = '',
): Partial<NewOrderFormState> {
  const fallbackName = str(customer.contact_person);
  const fallbackPhone = customerReceiverPhone(customer);

  if (isHcmProvince(noiDen, huyen)) {
    return {
      nguoiNhan: str(customer.receiver_hcm) || fallbackName,
      diaChiNhan: str(customer.address_hcm),
      dienThoaiNhan: str(customer.phone_hcm) || fallbackPhone,
    };
  }

  if (isDngProvince(noiDen, huyen)) {
    return {
      nguoiNhan: str(customer.receiver_dng) || fallbackName,
      diaChiNhan: str(customer.address_dng),
      dienThoaiNhan: str(customer.phone_dng) || fallbackPhone,
    };
  }

  return {
    nguoiNhan: fallbackName,
    diaChiNhan: '',
    dienThoaiNhan: fallbackPhone,
  };
}

/** Điền form nhập đơn từ bản ghi bảng customers */
export function customerToOrderPatch(customer: CustomerRecord, hubs: HubSummary[] = []): Partial<NewOrderFormState> {
  const noiDen = inferNoiDen(customer);
  const destHubId = noiDen ? hubIdFromCode(hubs, noiDen) : '';
  const huyen = str(customer.destination_province) || str(customer.region);

  const phoneKh = customerPhone(customer);

  const patch: Partial<NewOrderFormState> = {
    maKh: customer.code,
    nguoiGui: str(customer.name) || str(customer.short_name),
    diaChiGui: customerSenderAddress(customer),
    dienThoaiKh: phoneKh || undefined,
    huyen,
    nvgn: str(customer.delivery_handler) || undefined,
    buuTaLay: str(customer.manager_name) || undefined,
    giamGia: customer.discount_percent != null ? String(customer.discount_percent) : undefined,
    ghiChu: buildGhiChu(customer) || undefined,
  };

  const phuongThuc = mapPhuongThuc(customer.credit_type);
  if (phuongThuc) patch.phuongThuc = phuongThuc;

  const dichVu = mapDichVu(customer.price_table);
  if (dichVu) patch.dichVu = dichVu;

  const loaiBp = mapLoaiBp(customer.price_table);
  if (loaiBp) patch.loaiBp = loaiBp;

  const giaoHang = mapGiaoHang(customer.address_hcm);
  if (giaoHang) patch.giaoHang = giaoHang;

  if (customer.price_table && !dichVu) {
    patch.dichVuGiaTang = customer.price_table;
  }

  if (noiDen) {
    patch.noiDen = noiDen;
    if (destHubId) patch.destHubId = destHubId;
  }

  const receiverPatch = applyReceiverByDestination(customer, noiDen || 'HCM', huyen);
  Object.assign(patch, receiverPatch);

  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<NewOrderFormState>;
}
