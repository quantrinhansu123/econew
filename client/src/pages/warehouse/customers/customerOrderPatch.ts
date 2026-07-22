import type { CustomerRecord } from './customerFormTypes';
import type { NewOrderFormState } from '../orders/orderFormTypes';
import { hubIdFromCode } from '../orders/orderFormUtils';
import type { HubSummary } from '../orders/types';
import { extractVietnamAddressParts } from '../../../lib/vietnamAddressParts';

const str = (v: string | null | undefined) => (v ?? '').trim();

function inferNoiDen(customer: CustomerRecord): string {
  const explicitDestination = [
    customer.destination_province,
    customer.region,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/hà nội|ha noi|hanoi|\bhan\b|phú thọ|phu tho|hưng yên|hung yen|bắc ninh/.test(explicitDestination)) return 'HAN';
  if (/bình dương|binh duong|hồ chí minh|ho chi minh|\bhcm\b|tp\.?hcm|tphcm/.test(explicitDestination)) return 'HCM';
  if (/đà nẵng|da nang|\bdng\b|quảng ngãi|quang ngai/.test(explicitDestination)) return 'DNG';

  const warehouseData = [
    customer.address_han,
    customer.receiver_han,
    customer.address_hcm,
    customer.address_dng,
    customer.receiver_dng,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const hasHan = /hà nội|ha noi|hanoi|\bhan\b/.test(warehouseData);
  const hasHcm = /bình dương|binh duong|hồ chí minh|ho chi minh|\bhcm\b|tp\.?hcm|tphcm/.test(warehouseData);
  const hasDng = /đà nẵng|da nang|\bdng\b/.test(warehouseData);
  if (hasHan && !hasHcm && !hasDng) return 'HAN';
  if (hasHcm && !hasHan && !hasDng) return 'HCM';
  if (hasDng && !hasHan && !hasHcm) return 'DNG';
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

const comparablePhone = (value: string | null | undefined) => str(value).replace(/\D/g, '');

/**
 * SĐT khách hàng/người gửi chỉ lấy từ thông tin liên hệ chung.
 * Nếu dữ liệu cũ từng ghi nhầm số kho nhận vào mobile/phone_landline thì bỏ số đó,
 * không để cùng một số xuất hiện ở cả người gửi và người nhận.
 */
export function customerPhone(customer: CustomerRecord) {
  const receiverPhones = new Set(
    [customer.phone_han, customer.phone_hcm, customer.phone_dng]
      .map(comparablePhone)
      .filter(Boolean),
  );

  return [customer.mobile, customer.phone_landline]
    .map(str)
    .find((phone) => phone && !receiverPhones.has(comparablePhone(phone))) || '';
}

/** Địa chỉ gửi lấy riêng từ cột address, không dùng địa chỉ kho nhận. */
export function customerSenderAddress(customer: CustomerRecord) {
  return str(customer.address);
}

/** Địa chỉ nhận chung chỉ gồm dữ liệu kho nhận, không dùng địa chỉ gửi. */
export function customerReceiverAddress(customer: CustomerRecord) {
  return str(customer.address_han) || str(customer.address_hcm) || str(customer.address_dng);
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

/** Tỉnh đến là Hà Nội (HAN) */
export function isHanProvince(noiDen: string, huyen = ''): boolean {
  const code = noiDen.trim().toUpperCase();
  if (code === 'HAN') return true;
  const blob = `${noiDen} ${huyen}`.trim().toLowerCase();
  return /hà nội|ha noi|hanoi/.test(blob);
}

function isDngProvince(noiDen: string, huyen = ''): boolean {
  const code = noiDen.trim().toUpperCase();
  if (code === 'DNG') return true;
  const blob = `${noiDen} ${huyen}`.trim().toLowerCase();
  return /đà nẵng|da nang/.test(blob);
}

/**
 * Điền thông tin người nhận theo tỉnh đến, có fallback về dữ liệu nhận chung đã lưu.
 * ĐC/SĐT HAN, HCM hoặc DNG chỉ lấy khi tỉnh đến khớp hub tương ứng.
 * Không fallback sang SĐT khách hàng để tránh hai ô điện thoại bị trùng.
 */
export function applyReceiverByDestination(
  customer: CustomerRecord,
  noiDen: string,
  huyen = '',
): Partial<NewOrderFormState> {
  const fallbackName = str(customer.contact_person);

  if (isHanProvince(noiDen, huyen)) {
    const receiverAddress = str(customer.address_han);
    const addressParts = extractVietnamAddressParts(receiverAddress);
    return {
      nguoiNhan: str(customer.receiver_han) || fallbackName,
      diaChiNhan: receiverAddress,
      dienThoaiNhan: str(customer.phone_han),
      quanHuyen: addressParts.district,
      phuongXa: addressParts.ward,
    };
  }

  if (isHcmProvince(noiDen, huyen)) {
    const receiverAddress = str(customer.address_hcm);
    const addressParts = extractVietnamAddressParts(receiverAddress);
    return {
      nguoiNhan: str(customer.receiver_hcm) || fallbackName,
      diaChiNhan: receiverAddress,
      dienThoaiNhan: str(customer.phone_hcm),
      quanHuyen: addressParts.district,
      phuongXa: addressParts.ward,
    };
  }

  if (isDngProvince(noiDen, huyen)) {
    const receiverAddress = str(customer.address_dng);
    const addressParts = extractVietnamAddressParts(receiverAddress);
    return {
      nguoiNhan: str(customer.receiver_dng) || fallbackName,
      diaChiNhan: receiverAddress,
      dienThoaiNhan: str(customer.phone_dng),
      quanHuyen: addressParts.district,
      phuongXa: addressParts.ward,
    };
  }

  return {
    nguoiNhan: fallbackName,
    diaChiNhan: '',
    dienThoaiNhan: '',
    quanHuyen: '',
    phuongXa: '',
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
    // Gán cả chuỗi rỗng để khi đổi khách hàng không giữ lại SĐT của khách trước.
    dienThoaiKh: phoneKh,
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
