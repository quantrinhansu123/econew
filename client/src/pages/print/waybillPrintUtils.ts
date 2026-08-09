import { phuongThucToPrintLabel } from '../warehouse/orders/orderFormUtils';
import type { WaybillDetail } from '../warehouse/orders/types';
import { formatMoney, parseAmountInput } from '../../lib/formatMoney';
import { canonicalProvinceLabel, extractProvinceFromAddress } from '../../lib/vietnamProvince';
import { extractVietnamAddressParts } from '../../lib/vietnamAddressParts';
import { resolveWaybillDisplayNote } from '../../lib/waybillSpecialGoods';
import { normalizeDeliveryMethod } from '../warehouse/orders/orderFormData';

export interface WaybillPrintData {
  waybillCode: string;
  maKhGui: string;
  maBcGui: string;
  tenKhGui: string;
  diaChiGui: string;
  quanHuyenGui: string;
  tinhGui: string;
  sdtGui: string;
  maBcNhan: string;
  tenCongTyNhan: string;
  tenLienHeNhan: string;
  diaChiNhan: string;
  quanHuyenNhan: string;
  phuongXaNhan: string;
  tinhNhan: string;
  sdtNhan: string;
  moTaHang: string;
  giaoHang: string;
  soKien: string;
  trongLuongQuyDoi: string;
  cbm: string;
  ghiChu: string;
  noiDungHang: string;
  hinhThucThanhToan: string;
  thuHo: string;
  khaiGia: string;
  ngayGuiDon: string;
  cuocChinh: string;
  dichVuCongThem: string;
  tongCuoc: string;
  tongPhaiThuPhat: string;
  dichVu: string;
  dvGtgt: string;
  codStamp: boolean;
  showPricing: boolean;
}

const waitForImage = (image: HTMLImageElement) => {
  if (image.complete) {
    return typeof image.decode === 'function'
      ? image.decode().catch(() => undefined)
      : Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => resolve(), { once: true });
  });
};

/**
 * Đợi logo, barcode và QR sẵn sàng để tránh mở hộp thoại in khi ảnh còn trống.
 * Timeout giữ thao tác in không bị kẹt nếu dịch vụ ảnh bên ngoài không phản hồi.
 */
export async function printWaybillWhenReady() {
  const images = Array.from(
    document.querySelectorAll<HTMLImageElement>('.waybill-invoice img'),
  );
  const assetsReady = Promise.all(images.map(waitForImage));
  const timeout = new Promise<void>((resolve) => {
    window.setTimeout(resolve, 3_000);
  });

  await Promise.race([assetsReady, timeout]);
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
  window.print();
}

function parseContact(info?: string | null) {
  const parts = (info || '').split('|').map((p) => p.trim());
  if (parts.length >= 2) {
    return { name: parts[0], phone: parts[1], address: parts.slice(2).join(' | ') };
  }
  return { name: info || '', phone: '', address: '' };
}

function parseNoteField(note: string, key: string) {
  const match = note.match(new RegExp(`${key}=([^|]+)`));
  return match?.[1]?.trim() || '';
}

function userNoteFromStoredNote(note: string) {
  return resolveWaybillDisplayNote(note);
}

function formatNum(v: unknown, digits = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatDate(d?: string | null) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatPhoneForPrint(input?: string | null) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  const compact = raw.replace(/[^\d+]/g, '');
  if (/^0\d{9}$/.test(compact)) {
    return `${compact.slice(0, 4)} ${compact.slice(4, 7)} ${compact.slice(7)}`;
  }
  if (/^0\d{10}$/.test(compact)) {
    return `${compact.slice(0, 4)} ${compact.slice(4, 7)} ${compact.slice(7)}`;
  }
  if (/^\+84\d{9}$/.test(compact)) {
    return `${compact.slice(0, 3)} ${compact.slice(3, 6)} ${compact.slice(6, 9)} ${compact.slice(9)}`;
  }
  if (/^84\d{9}$/.test(compact)) {
    return `${compact.slice(0, 2)} ${compact.slice(2, 5)} ${compact.slice(5, 8)} ${compact.slice(8)}`;
  }

  return raw.replace(/\s+/g, ' ');
}

function parseM3FromNote(note: string) {
  const match = note.match(/dimensions_cm=([^|]+)/);
  if (!match) return 0;
  const [length, width, height] = match[1].split('x').map((part) => Number(part.trim()));
  if (!length || !width || !height) return 0;
  return (length * width * height) / 1_000_000;
}

export function buildWaybillPrintData(
  waybill: WaybillDetail,
  showPricing = false,
): WaybillPrintData {
  const note = waybill.note || waybill.notes || '';
  const sender = parseContact(waybill.sender_info);
  const receiver = parseContact(waybill.receiver_info);
  const maKh = parseNoteField(note, 'ma_kh');
  const noiDung = waybill.noi_dung?.trim() || parseNoteField(note, 'content');
  const ghiChu = userNoteFromStoredNote(note);
  const dichVu = parseNoteField(note, 'dich_vu');
  const loaiBp = parseNoteField(note, 'loai_bp');
  const giaoHang = normalizeDeliveryMethod(parseNoteField(note, 'giao_hang'));

  const receiverName = (waybill as { receiver_name?: string }).receiver_name || receiver.name || '';
  const receiverCompanyName =
    waybill.receiver_company_name?.trim()
    || parseNoteField(note, 'receiver_company_name');
  const receiverAddress = waybill.receiver_address || receiver.address || '';
  const receiverAddressParts = extractVietnamAddressParts(receiverAddress);
  const receiverProvince =
    parseNoteField(note, 'tinh_den')
    || parseNoteField(note, 'huyen')
    || waybill.noi_den?.trim()
    || extractProvinceFromAddress(receiverAddress)
    || waybill.dest_hub?.province?.trim()
    || waybill.dest_hub?.name
    || waybill.dest_hub?.code?.toUpperCase()
    || '';

  const volumetricWeight = Number(waybill.volumetric_weight) || 0;
  const m3 =
    Number((waybill as { the_tich_m3?: number }).the_tich_m3) ||
    parseM3FromNote(note) ||
    0;

  const cod = Number(waybill.cod_amount) || 0;
  const storedFreight = Number(waybill.freight_amount) || Number(waybill.cost_amount) || 0;
  const notedMainFreight = parseAmountInput(parseNoteField(note, 'cuoc_chinh'));
  const serviceExtra = parseAmountInput(
    parseNoteField(note, 'phu_phi') || parseNoteField(note, 'giamGia'),
  );
  const mainFreight = notedMainFreight || storedFreight;
  const totalFreight = mainFreight + serviceExtra;
  const paymentType = String(waybill.payment_type || '').toUpperCase();
  const phuongThuc = parseNoteField(note, 'phuong_thuc');
  const receiverPays =
    phuongThuc.trim().toLocaleLowerCase('vi-VN') === 'người nhận thanh toán'
    || (!phuongThuc.trim() && paymentType === 'CC');
  const pricingVisible = showPricing || receiverPays;
  const storedPayment = parseAmountInput(parseNoteField(note, 'thanh_toan'));
  const calculatedCollection = cod + totalFreight;
  const totalToCollect = receiverPays
    ? calculatedCollection || storedPayment
    : cod;
  const createdAt = waybill.received_at || (waybill as { created_at?: string }).created_at;
  const sentAt = waybill.sent_date || parseNoteField(note, 'ngay_gui') || createdAt;

  return {
    waybillCode: waybill.waybill_code || waybill.code || String(waybill.id),
    maKhGui: maKh || sender.name.split(' ')[0] || '',
    maBcGui: waybill.origin_hub?.code?.toUpperCase() || '',
    tenKhGui: (waybill as { sender_name?: string }).sender_name || sender.name,
    diaChiGui: (waybill as { sender_address?: string }).sender_address || sender.address,
    quanHuyenGui: '',
    tinhGui: waybill.origin_hub?.code?.toUpperCase() || waybill.origin_hub?.name || '',
    sdtGui: formatPhoneForPrint((waybill as { sender_phone?: string }).sender_phone || sender.phone),
    maBcNhan: waybill.dest_hub?.code?.toUpperCase() || '',
    tenCongTyNhan: receiverCompanyName,
    tenLienHeNhan: receiverName,
    diaChiNhan: receiverAddress,
    quanHuyenNhan:
      parseNoteField(note, 'quan_huyen')
      || receiverAddressParts.district,
    phuongXaNhan:
      waybill.receiver_ward?.trim()
      || parseNoteField(note, 'phuong_xa')
      || receiverAddressParts.ward,
    tinhNhan: canonicalProvinceLabel(receiverProvince),
    sdtNhan: formatPhoneForPrint((waybill as { receiver_phone?: string }).receiver_phone || receiver.phone),
    moTaHang: noiDung,
    giaoHang,
    soKien: String(waybill.package_count ?? 1),
    trongLuongQuyDoi: formatNum(volumetricWeight, 2) || '0.00',
    cbm: formatNum(m3, 2) || '0.00',
    ghiChu,
    noiDungHang: noiDung,
    hinhThucThanhToan: phuongThucToPrintLabel(phuongThuc, waybill.payment_type),
    thuHo: formatNum(cod, 0) || '0',
    khaiGia: 'Không',
    ngayGuiDon: formatDate(sentAt),
    cuocChinh: pricingVisible ? formatMoney(mainFreight) : '',
    dichVuCongThem: pricingVisible ? formatMoney(serviceExtra) : '',
    tongCuoc: pricingVisible ? formatMoney(totalFreight) : '',
    tongPhaiThuPhat: formatNum(totalToCollect, 0) || '0',
    dichVu: (dichVu || loaiBp || 'ĐƯỜNG BỘ').toUpperCase(),
    dvGtgt: parseNoteField(note, 'dich_vu_gia_tang') || 'Tiêu chuẩn',
    codStamp: paymentType === 'COD' || cod > 0,
    showPricing: pricingVisible,
  };
}
