import type { CustomerRecord } from './customerFormTypes';
import type { NewOrderFormState } from '../orders/orderFormTypes';
import { extractVietnamAddressParts } from '../../../lib/vietnamAddressParts';

const str = (v: string | null | undefined) => (v ?? '').trim();

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

/** SĐT khách hàng/người gửi chỉ lấy từ thông tin liên hệ chung, không lấy SĐT kho nhận. */
export function customerPhone(customer: CustomerRecord) {
  return str(customer.mobile) || str(customer.phone_landline);
}

/** Địa chỉ gửi lấy riêng từ cột address, không dùng địa chỉ kho nhận. */
export function customerSenderAddress(customer: CustomerRecord) {
  const address = str(customer.address);
  const normalizedAddress = address.toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ');
  const customerNames = [customer.name, customer.short_name]
    .map((name) => str(name).toLocaleLowerCase('vi-VN').replace(/\s+/g, ' '))
    .filter(Boolean);

  // Một số hồ sơ cũ ghi nhầm tên khách vào cột địa chỉ. Coi đó là chưa có
  // địa chỉ để nhân viên nhập tay trên đơn.
  return customerNames.includes(normalizedAddress) ? '' : address;
}

/** Địa chỉ nhận chung chỉ gồm dữ liệu kho nhận, không dùng địa chỉ gửi. */
export function customerReceiverAddress(customer: CustomerRecord) {
  return str(customer.address_han) || str(customer.address_hcm) || str(customer.address_dng);
}

/** @deprecated Dùng customerSenderAddress hoặc customerReceiverAddress */
export function customerAddress(customer: CustomerRecord) {
  return customerSenderAddress(customer);
}

/** Tỉnh đến là Hồ Chí Minh (HCM) */
export function isHcmProvince(noiDen: string, huyen = ''): boolean {
  const code = noiDen.trim().toUpperCase();
  if (code === 'HCM') return true;
  const blob = `${noiDen} ${huyen}`.trim().toLowerCase();
  return /hồ chí minh|ho chi minh|tp\.?hcm|tphcm|sài gòn|sai gon/.test(blob);
}

/**
 * Chỉ điền thông tin kho cố định của khách khi tỉnh nhận là TP.HCM.
 * Các tỉnh khác dùng thông tin người nhận nhập riêng trên từng đơn.
 */
export function applyReceiverByDestination(
  customer: CustomerRecord,
  noiDen: string,
  huyen = '',
): Partial<NewOrderFormState> {
  if (!isHcmProvince(noiDen, huyen)) return {};

  const receiverAddress = str(customer.address_hcm);
  const addressParts = extractVietnamAddressParts(receiverAddress);
  return {
    nguoiNhan: str(customer.receiver_hcm),
    diaChiNhan: receiverAddress,
    dienThoaiNhan: str(customer.phone_hcm),
    quanHuyen: addressParts.district,
    phuongXa: addressParts.ward,
  };
}

const RECEIVER_AUTOFILL_FIELDS = [
  'nguoiNhan',
  'diaChiNhan',
  'dienThoaiNhan',
  'quanHuyen',
  'phuongXa',
] as const;

/**
 * Khi đổi tỉnh nhận, điền kho HCM nếu phù hợp; nếu rời HCM thì chỉ xóa
 * giá trị vẫn còn đúng bằng dữ liệu tự điền, không xóa nội dung người dùng đã sửa tay.
 */
export function receiverPatchForProvinceChange(
  customer: CustomerRecord,
  currentForm: NewOrderFormState,
  receiverProvince: string,
): Partial<NewOrderFormState> {
  if (isHcmProvince(receiverProvince)) {
    return applyReceiverByDestination(customer, receiverProvince);
  }

  const hcmReceiver = applyReceiverByDestination(customer, 'HCM');
  const patch: Partial<NewOrderFormState> = {};
  for (const field of RECEIVER_AUTOFILL_FIELDS) {
    if (str(currentForm[field]) === str(hcmReceiver[field])) patch[field] = '';
  }
  return patch;
}

/** Điền form nhập đơn từ bản ghi bảng customers */
export function customerToOrderPatch(customer: CustomerRecord): Partial<NewOrderFormState> {
  const phoneKh = customerPhone(customer);

  const patch: Partial<NewOrderFormState> = {
    maKh: customer.code,
    nguoiGui: str(customer.name) || str(customer.short_name),
    diaChiGui: customerSenderAddress(customer),
    // Gán cả chuỗi rỗng để khi đổi khách hàng không giữ lại SĐT của khách trước.
    dienThoaiKh: phoneKh,
    nvgn: str(customer.delivery_handler) || undefined,
    buuTaLay: str(customer.manager_name) || undefined,
    giamGia: customer.discount_percent != null ? String(customer.discount_percent) : undefined,
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

  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<NewOrderFormState>;
}
