import { phuongThucToPrintLabel } from '../warehouse/orders/orderFormUtils';
import type { WaybillDetail } from '../warehouse/orders/types';

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
  tenKhNhan: string;
  diaChiNhan: string;
  tinhNhan: string;
  sdtNhan: string;
  moTaHang: string;
  soKien: string;
  trongLuong: string;
  tongLuong: string;
  ghiChu: string;
  noiDungHang: string;
  hinhThucThanhToan: string;
  thuHo: string;
  khaiGia: string;
  ngayGuiDon: string;
  tongPhaiThuPhat: string;
  dichVu: string;
  dvGtgt: string;
  codStamp: boolean;
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
  if (parts.length >= 3) {
    return { phone: parts[0], name: parts[1], address: parts.slice(2).join(' | ') };
  }
  return { phone: '', name: info || '', address: '' };
}

function parseNoteField(note: string, key: string) {
  const match = note.match(new RegExp(`${key}=([^|]+)`));
  return match?.[1]?.trim() || '';
}

const NOTE_METADATA_KEYS = new Set([
  'ma_kh',
  'content',
  'loai_bp',
  'dich_vu',
  'dich_vu_gia_tang',
  'phuong_thuc',
  'billing_unit',
  'unit_price',
  'gio',
  'giao_hang',
  'ngay_gui',
  'nvgn',
  'dich_vu_gia_tang',
  'so_khoang',
  'buu_ta_lay',
  'buu_ta_phat',
  'dvdb',
  'cuoc_chinh',
  'tong_cuoc',
  'thue_suat',
  'vat',
  'co_vat',
  'trang_thai',
  'dimensions_cm',
  'volumetric_weight',
  'the_tich_m3',
  'phu_phi',
  'thanh_toan',
  'tinh_den',
  'huyen',
  'quan_huyen',
  'phuong_xa',
]);

function stripNoteMetadata(note: string) {
  return note
    .split('|')
    .map((part) => part.trim())
    .filter((part) => {
      const key = part.split('=')[0]?.trim();
      return !NOTE_METADATA_KEYS.has(key);
    })
    .join(' | ');
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

function parseM3FromNote(note: string) {
  const match = note.match(/dimensions_cm=([^|]+)/);
  if (!match) return 0;
  const [length, width, height] = match[1].split('x').map((part) => Number(part.trim()));
  if (!length || !width || !height) return 0;
  return (length * width * height) / 1_000_000;
}

export function buildWaybillPrintData(waybill: WaybillDetail): WaybillPrintData {
  const note = waybill.note || waybill.notes || '';
  const sender = parseContact(waybill.sender_info);
  const receiver = parseContact(waybill.receiver_info);
  const maKh = parseNoteField(note, 'ma_kh');
  const noiDung = parseNoteField(note, 'content');
  const ghiChu = stripNoteMetadata(note);
  const dichVu = parseNoteField(note, 'dich_vu');
  const loaiBp = parseNoteField(note, 'loai_bp');

  const receiverName = (waybill as { receiver_name?: string }).receiver_name || receiver.name || '';
  const receiverAddress = waybill.receiver_address || receiver.address || '';

  const weight = Number(waybill.weight) || 0;
  const m3 =
    Number((waybill as { the_tich_m3?: number }).the_tich_m3) ||
    parseM3FromNote(note) ||
    0;

  const cod = Number(waybill.cod_amount) || 0;
  const paymentType = String(waybill.payment_type || '').toUpperCase();
  const phuongThuc = parseNoteField(note, 'phuong_thuc');
  const createdAt = waybill.received_at || (waybill as { created_at?: string }).created_at;

  return {
    waybillCode: waybill.waybill_code || waybill.code || String(waybill.id),
    maKhGui: maKh || sender.name.split(' ')[0] || '',
    maBcGui: waybill.origin_hub?.code?.toUpperCase() || '',
    tenKhGui: (waybill as { sender_name?: string }).sender_name || sender.name,
    diaChiGui: (waybill as { sender_address?: string }).sender_address || sender.address,
    quanHuyenGui: '',
    tinhGui: waybill.origin_hub?.code?.toUpperCase() || waybill.origin_hub?.name || '',
    sdtGui: (waybill as { sender_phone?: string }).sender_phone || sender.phone,
    maBcNhan: waybill.dest_hub?.code?.toUpperCase() || '',
    tenKhNhan: receiverName,
    diaChiNhan: receiverAddress,
    tinhNhan:
      parseNoteField(note, 'tinh_den')
      || parseNoteField(note, 'huyen')
      || (waybill as { noi_den?: string }).noi_den?.trim()
      || waybill.dest_hub?.name
      || waybill.dest_hub?.code?.toUpperCase()
      || '',
    sdtNhan: (waybill as { receiver_phone?: string }).receiver_phone || receiver.phone,
    moTaHang: noiDung,
    soKien: String(waybill.package_count ?? 1),
    trongLuong: formatNum(weight, 0) || '0',
    tongLuong: formatNum(m3, 2) || '0.00',
    ghiChu,
    noiDungHang: noiDung,
    hinhThucThanhToan: phuongThucToPrintLabel(phuongThuc, waybill.payment_type),
    thuHo: formatNum(cod, 0) || '0',
    khaiGia: 'Không',
    ngayGuiDon: formatDate(createdAt),
    tongPhaiThuPhat: formatNum(cod, 0) || '0',
    dichVu: (dichVu || loaiBp || 'ĐƯỜNG BỘ').toUpperCase(),
    dvGtgt: parseNoteField(note, 'dich_vu_gia_tang') || 'Tiêu chuẩn',
    codStamp: paymentType === 'COD' || cod > 0,
  };
}
