import type { HubSummary, PaymentType, WaybillDetail } from './types';
import { emptyOrderForm } from './orderFormData';
import type { BillListItem, NewOrderFormState } from './orderFormTypes';
import { extractProvinceFromAddress } from '../../../lib/vietnamProvince';
import { extractVietnamAddressParts } from '../../../lib/vietnamAddressParts';
import { joinWaybillImages, parseWaybillImages } from '../../../lib/waybillImages';

const parseNumber = (value: string) => Number(String(value).replace(/[^\d.-]/g, ''));

/** Tiền VN: chỉ lấy chữ số, bỏ dấu chấm ngàn */
export function parseMoneyAmount(value: string): number {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return 0;
  const num = Number(digits);
  return Number.isFinite(num) ? num : 0;
}

export function formatDisplayNumber(value: unknown, digits = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return num.toLocaleString('vi-VN', { maximumFractionDigits: digits });
}

export function formatDonGia(value: string): string {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  const num = Number(digits);
  if (!Number.isFinite(num)) return '';
  return formatDisplayNumber(num, 0);
}

export function calcVolumetricWeight(length: string, width: string, height: string): string {
  const l = parseNumber(length);
  const w = parseNumber(width);
  const h = parseNumber(height);
  if (!l || !w || !h) return '';
  return formatDisplayNumber((l * w * h) / 5000, 3);
}

export function calcM3(length: string, width: string, height: string): string {
  const l = parseNumber(length);
  const w = parseNumber(width);
  const h = parseNumber(height);
  if (!l || !w || !h) return '';
  return formatDisplayNumber((l * w * h) / 1_000_000, 3);
}

export function isWeightBillingUnit(unit: string) {
  const normalized = unit.trim().toLowerCase();
  return normalized === 'cân' || normalized === 'can' || normalized === 'kg';
}

export function isVolumeBillingUnit(unit: string) {
  const normalized = unit.trim().toLowerCase();
  return normalized === 'khối' || normalized === 'khoi' || normalized === 'm3' || normalized === 'm³';
}

/** Số lượng tính cước theo ĐVT: Cân/Kg | Khối/m3 | Trọn gói | Chuyến | Lô */
export function getBillingQuantity(form: NewOrderFormState): number {
  const unit = (form.donGiaDonVi || 'Cân').trim().toLowerCase();
  if (isVolumeBillingUnit(unit)) return parseNumber(form.m3);
  if (unit === 'trọn gói' || unit === 'tron goi' || unit === 'chuyến' || unit === 'chuyen' || unit === 'lô' || unit === 'lo') return 1;
  const kg = parseNumber(form.klKg);
  const volKg = parseNumber(form.klQuyDoi);
  return Math.max(kg, volKg, kg || volKg || 0);
}

/** Cước chính = đơn giá × số lượng (theo ĐVT) */
export function calcCuocChinhAmount(form: NewOrderFormState): number {
  const qty = getBillingQuantity(form);
  const unitPrice = parseMoneyAmount(form.donGia);
  if (!qty || !unitPrice) return 0;
  return Math.round(qty * unitPrice);
}

export function calcOrderPricing(form: NewOrderFormState) {
  const cuocChinhAmount = calcCuocChinhAmount(form);
  const giamGia = parseMoneyAmount(form.giamGia);
  const tongCuoc = cuocChinhAmount;
  const thanhToan = Math.max(0, tongCuoc - giamGia);

  return {
    cuocChinh: formatDisplayNumber(cuocChinhAmount, 0),
    tongCuoc: formatDisplayNumber(tongCuoc, 0),
    vat: '0',
    thanhToan: formatDisplayNumber(thanhToan, 0),
  };
}

const PRICING_TRIGGER_FIELDS: (keyof NewOrderFormState)[] = [
  'donGia',
  'cod',
  'giamGia',
  'klKg',
  'klQuyDoi',
  'm3',
  'donGiaDonVi',
];

export function isPricingField(key: keyof NewOrderFormState) {
  return PRICING_TRIGGER_FIELDS.includes(key);
}

export function applyPricingToForm(form: NewOrderFormState): NewOrderFormState {
  const pricing = calcOrderPricing(form);
  return {
    ...form,
    ...pricing,
    donGia: formatDonGia(form.donGia),
    cod: formatDonGia(form.cod),
    giamGia: formatDonGia(form.giamGia),
  };
}

export function hubCodeFromId(hubs: HubSummary[], hubId: string) {
  return hubs.find((h) => String(h.id) === hubId)?.code?.toUpperCase() || '';
}

export function hubIdFromCode(hubs: HubSummary[], code: string) {
  const normalized = code.trim().toUpperCase();
  return String(hubs.find((h) => h.code?.toUpperCase() === normalized)?.id || '');
}

/** Chuẩn hóa SĐT VN: bỏ khoảng trắng, +84 → 0, thiếu số 0 đầu thì bổ sung */
export function normalizeVnPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  if (digits.length === 9 && /^[35789]/.test(digits)) digits = `0${digits}`;
  return digits;
}

export function isValidVnPhone(raw: string): boolean {
  const phone = normalizeVnPhone(raw);
  if (!phone) return false;
  if (/^0(3|5|7|8|9)\d{8}$/.test(phone)) return true;
  if (/^0(2[0-9]|24|28)\d{7,8}$/.test(phone)) return true;
  return /^0\d{9,10}$/.test(phone);
}

function parseContactInfo(info?: string | null) {
  const parts = (info || '').split('|').map((part) => part.trim());
  return {
    name: parts[0] || '',
    phone: parts[1] || '',
    address: parts[2] || '',
  };
}

const NOTE_METADATA_KEYS = new Set([
  'ma_kh',
  'content',
  'loai_bp',
  'dich_vu',
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

const hubCodeLabel = (hub?: HubSummary | null, fallbackId?: string | number | null) =>
  hub?.code?.trim().toUpperCase() || (fallbackId ? `#${fallbackId}` : '');

const collectOnDeliveryAmount = (waybill: WaybillDetail) => {
  const cod = Number(waybill.cod_amount ?? 0) || 0;
  const cc = Number(waybill.cc_amount ?? 0) || 0;
  if (cc || cod) return cc + cod;
  return waybill.payment_type === 'CC' ? Number(waybill.freight_amount ?? waybill.cost_amount ?? 0) || 0 : cod;
};

const formatBillDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const formatDateInput = (value?: string | null) => {
  if (!value) return '';
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const parseDimensions = (waybill: WaybillDetail, note: string) => {
  const stored = [waybill.length, waybill.width, waybill.height].map((value) => Number(value ?? 0));
  if (stored.some((value) => value > 0)) return stored;
  const fromNote = parseNoteField(note, 'dimensions_cm')
    .split('x')
    .map((value) => Number(value.trim()));
  return fromNote.length === 3 && fromNote.every(Number.isFinite) ? fromNote : [0, 0, 0];
};

function waybillToOrderFormBase(waybill: WaybillDetail, hubs: HubSummary[]): NewOrderFormState {
  const destId = waybill.dest_hub_id ? String(waybill.dest_hub_id) : '';
  const originId = waybill.origin_hub_id ? String(waybill.origin_hub_id) : '';
  const destCode = waybill.dest_hub?.code?.toUpperCase() || hubCodeFromId(hubs, destId);
  const sender = parseContactInfo(waybill.sender_info);
  const receiver = parseContactInfo(waybill.receiver_info);
  const billingUnit = resolveBillingUnit(waybill);
  const unitPrice = resolveUnitPrice(waybill, billingUnit);
  const note = waybill.note || waybill.notes || '';
  const [length, width, height] = parseDimensions(waybill, note);
  const receiverAddress = waybill.receiver_address?.trim() || receiver.address || waybill.receiver_info || '';
  const addressParts = extractVietnamAddressParts(receiverAddress);
  const volumeM3 = Number(
    (waybill as { the_tich_m3?: number }).the_tich_m3
    ?? parseNoteField(note, 'the_tich_m3')
    ?? 0,
  );

  return {
    ...emptyOrderForm(),
    maKh: waybill.ma_kh?.trim() || parseNoteField(note, 'ma_kh'),
    nguoiGui: waybill.sender_name?.trim() || sender.name || waybill.sender_info || '',
    diaChiGui: waybill.sender_address?.trim() || sender.address || '',
    dienThoaiKh: waybill.sender_phone?.trim() || sender.phone || '',
    dienThoaiNhan: waybill.receiver_phone?.trim() || receiver.phone || '',
    nguoiNhan: waybill.receiver_name?.trim() || receiver.name || waybill.receiver_info || '',
    diaChiNhan: receiverAddress,
    noiDen: destCode || 'HCM',
    originHubId: originId,
    destHubId: destId,
    huyen:
      (waybill as { noi_den?: string }).noi_den?.trim()
      || parseNoteField(note, 'tinh_den')
      || parseNoteField(note, 'huyen')
      || waybill.dest_hub?.name
      || '',
    quanHuyen:
      (waybill as { receiver_district?: string }).receiver_district?.trim()
      || parseNoteField(note, 'quan_huyen')
      || addressParts.district,
    phuongXa:
      (waybill as { receiver_ward?: string }).receiver_ward?.trim()
      || parseNoteField(note, 'phuong_xa')
      || addressParts.ward,
    soBill: waybill.waybill_code || waybill.code || '',
    loaiBp: parseNoteField(note, 'loai_bp') || 'CPN',
    dichVu: parseNoteField(note, 'dich_vu') || 'Tiêu chuẩn 72h',
    gio: parseNoteField(note, 'gio') || '16h',
    giaoHang: parseNoteField(note, 'giao_hang') || 'Văn phòng',
    klKg: String(waybill.weight ?? ''),
    soKien: String(waybill.package_count ?? 1),
    klQuyDoi: String(waybill.volumetric_weight ?? waybill.weight ?? ''),
    m3: volumeM3 > 0 ? String(volumeM3) : '',
    chieuDai: String(length || 0),
    chieuRong: String(width || 0),
    chieuCao: String(height || 0),
    donGia: unitPrice ? formatDonGia(String(unitPrice)) : '',
    donGiaDonVi: billingUnit,
    dichVuGiaTang: parseNoteField(note, 'dich_vu_gia_tang') || 'Tiêu chuẩn',
    soKhoang: parseNoteField(note, 'so_khoang'),
    nvgn: parseNoteField(note, 'nvgn') || 'ADMIN',
    dvdb: formatDisplayNumber((waybill as { dvdb?: number }).dvdb, 0) || '0',
    cod: formatDonGia(String(waybill.cod_amount ?? '0')),
    giamGia: formatDonGia(String(parseNoteField(note, 'phu_phi') || parseNoteField(note, 'giamGia') || '0')),
    phuongThuc: phuongThucFromWaybill(waybill),
    noiDung: parseNoteField(note, 'content'),
    ghiChu: stripNoteMetadata(note),
    billImages: parseWaybillImages(waybill.delivery_photo_url),
    xeLay: String((waybill as { xe_lay?: string }).xe_lay ?? ''),
    buuTaLay: parseNoteField(note, 'buu_ta_lay'),
    xePhat: String((waybill as { xe_phat?: string }).xe_phat ?? ''),
    buuTaPhat: parseNoteField(note, 'buu_ta_phat'),
    ngayDi:
      formatDateInput(parseNoteField(note, 'ngay_gui'))
      || formatDateInput(waybill.created_at || waybill.received_at),
    thueSuat: parseNoteField(note, 'thue_suat') || '0%',
    vat: formatDonGia(parseNoteField(note, 'vat')) || '0',
    coVat: parseNoteField(note, 'co_vat') === '1',
    trangThai: String(waybill.current_state || waybill.status || 'RECEIVED'),
  };
}

export function waybillToOrderForm(waybill: WaybillDetail, hubs: HubSummary[]): NewOrderFormState {
  const base = waybillToOrderFormBase(waybill, hubs);
  return applyPricingToForm(base);
}

export function waybillToBillItem(waybill: WaybillDetail): BillListItem {
  const note = waybill.note || waybill.notes || '';
  const sender = parseContactInfo(waybill.sender_info);
  return {
    id: String(waybill.id),
    date: formatBillDate(waybill.created_at || waybill.received_at),
    createdAt: waybill.created_at || waybill.received_at || null,
    waybill_code: waybill.waybill_code || waybill.code || `#${waybill.id}`,
    package_count: Number(waybill.package_count) || 1,
    destination: hubCodeLabel(waybill.dest_hub, waybill.dest_hub_id),
    senderName: waybill.sender_name?.trim() || sender.name || waybill.sender_info || '',
    customerCode: waybill.ma_kh?.trim() || parseNoteField(note, 'ma_kh'),
    collectOnDelivery: collectOnDeliveryAmount(waybill),
  };
}

export function paymentTypeFromForm(form: NewOrderFormState): PaymentType {
  if (form.phuongThuc === 'Người nhận thanh toán') return 'CC';
  if (form.phuongThuc === 'COD') return 'COD';
  if (form.phuongThuc === 'Tiền mặt') return 'CC';
  return 'PP';
}

/** Nhãn in phiếu — Hình thức thanh toán */
export function phuongThucToPrintLabel(phuongThuc?: string, paymentType?: string | null): string {
  const method = (phuongThuc || '').trim();
  if (method === 'Tiền mặt') return 'TIỀN MẶT';
  if (method === 'COD') return 'COD';
  if (method === 'Chuyển khoản') return 'CHUYỂN KHOẢN';
  if (method) return method.toUpperCase();

  const t = String(paymentType || '').toUpperCase();
  if (t === 'COD') return 'COD';
  if (t === 'CC') return 'NGƯỜI NHẬN THANH TOÁN';
  if (t === 'PP') return 'CÔNG NỢ';
  return '';
}

function parseNoteField(note: string, key: string) {
  const match = note.match(new RegExp(`${key}=([^|]+)`));
  return match?.[1]?.trim() || '';
}

function phuongThucFromWaybill(waybill: WaybillDetail): string {
  const note = waybill.note || waybill.notes || '';
  const fromNote = parseNoteField(note, 'phuong_thuc');
  if (fromNote) return fromNote;
  if (waybill.payment_type === 'COD') return 'COD';
  if (waybill.payment_type === 'CC') return 'Tiền mặt';
  return 'Công nợ tháng';
}

function resolveBillingUnit(waybill: WaybillDetail): string {
  const note = waybill.note || waybill.notes || '';
  return String(
    (waybill as { don_gia_don_vi?: string }).don_gia_don_vi || parseNoteField(note, 'billing_unit') || 'Cân',
  );
}

function resolveUnitPrice(waybill: WaybillDetail, billingUnit: string): number {
  const note = waybill.note || waybill.notes || '';
  const storedUnitPrice =
    Number((waybill as { don_gia?: number }).don_gia) || parseMoneyAmount(parseNoteField(note, 'unit_price'));
  if (storedUnitPrice) return storedUnitPrice;

  const totalFreight = Number(waybill.freight_amount ?? waybill.cost_amount ?? 0);
  if (!Number.isFinite(totalFreight) || totalFreight <= 0) return 0;

  const unit = billingUnit.trim().toLowerCase();
  const weight = Number(waybill.weight ?? 0);
  const volumetricWeight = Number(waybill.volumetric_weight ?? 0);
  const volumeM3 = Number((waybill as { the_tich_m3?: number }).the_tich_m3 ?? 0);
  const quantity = isVolumeBillingUnit(unit)
    ? volumeM3
    : unit === 'trọn gói' || unit === 'tron goi' || unit === 'chuyến' || unit === 'chuyen' || unit === 'lô' || unit === 'lo'
      ? 1
      : Math.max(weight, volumetricWeight, weight || volumetricWeight || 0);

  if (!quantity) return 0;
  return Math.round(totalFreight / quantity);
}

export function buildCreatePayload(form: NewOrderFormState, volumetricWeight: number) {
  const paymentType = paymentTypeFromForm(form);
  const freight = calcCuocChinhAmount(form);
  const cod = parseMoneyAmount(form.cod);
  const surcharge = parseMoneyAmount(form.giamGia);
  const thanhToan = Math.max(0, parseMoneyAmount(form.thanhToan) || freight - surcharge);
  const weight = parseNumber(form.klKg);
  const volumeM3 = parseNumber(form.m3);
  const length = Math.max(0, parseNumber(form.chieuDai));
  const width = Math.max(0, parseNumber(form.chieuRong));
  const height = Math.max(0, parseNumber(form.chieuCao));
  const receiverProvince = form.huyen.trim() || extractProvinceFromAddress(form.diaChiNhan.trim());

  return {
    waybill_code: form.soBill.trim().toUpperCase(),
    sender_name: form.nguoiGui.trim(),
    sender_phone: form.dienThoaiKh.trim() || '0900000000',
    sender_address: form.diaChiGui.trim() || form.nguoiGui.trim(),
    receiver_name: form.nguoiNhan.trim(),
    receiver_phone: normalizeVnPhone(form.dienThoaiNhan.trim()) || '0900000000',
    receiver_address: form.diaChiNhan.trim(),
    noi_den: receiverProvince || undefined,
    origin_hub_id: form.originHubId,
    dest_hub_id: form.destHubId,
    weight: weight || parseNumber(form.klQuyDoi) || 1,
    length,
    width,
    height,
    volumetric_weight: volumetricWeight,
    the_tich_m3: volumeM3,
    package_count: Math.max(1, parseInt(form.soKien, 10) || 1),
    freight_amount: freight,
    cod_amount: cod,
    cc_amount: paymentType === 'CC' ? thanhToan : 0,
    xe_lay: form.xeLay.trim() || undefined,
    xe_phat: form.xePhat.trim() || undefined,
    delivery_photo_url: joinWaybillImages(form.billImages) || undefined,
    noi_dung: form.noiDung.trim() || undefined,
    note: [
      form.maKh && `ma_kh=${form.maKh}`,
      form.noiDung && `content=${form.noiDung}`,
      form.loaiBp && `loai_bp=${form.loaiBp}`,
      form.dichVu && `dich_vu=${form.dichVu}`,
      form.phuongThuc && `phuong_thuc=${form.phuongThuc}`,
      form.donGiaDonVi && `billing_unit=${form.donGiaDonVi}`,
      `unit_price=${parseMoneyAmount(form.donGia)}`,
      form.gio && `gio=${form.gio}`,
      form.giaoHang && `giao_hang=${form.giaoHang}`,
      form.ngayDi && `ngay_gui=${form.ngayDi}`,
      form.nvgn && `nvgn=${form.nvgn}`,
      form.dichVuGiaTang && `dich_vu_gia_tang=${form.dichVuGiaTang}`,
      form.soKhoang && `so_khoang=${form.soKhoang}`,
      form.buuTaLay && `buu_ta_lay=${form.buuTaLay}`,
      form.buuTaPhat && `buu_ta_phat=${form.buuTaPhat}`,
      form.dvdb && `dvdb=${parseMoneyAmount(form.dvdb)}`,
      `cuoc_chinh=${freight}`,
      `tong_cuoc=${parseMoneyAmount(form.tongCuoc) || freight}`,
      form.thueSuat && `thue_suat=${form.thueSuat}`,
      `vat=${parseMoneyAmount(form.vat)}`,
      `co_vat=${form.coVat ? 1 : 0}`,
      form.trangThai && `trang_thai=${form.trangThai}`,
      `phu_phi=${surcharge}`,
      `thanh_toan=${thanhToan}`,
      receiverProvince && `tinh_den=${receiverProvince}`,
      form.huyen.trim() && `huyen=${form.huyen.trim()}`,
      form.quanHuyen.trim() && `quan_huyen=${form.quanHuyen.trim()}`,
      form.phuongXa.trim() && `phuong_xa=${form.phuongXa.trim()}`,
      `dimensions_cm=${length}x${width}x${height}`,
      `volumetric_weight=${volumetricWeight}`,
      `the_tich_m3=${volumeM3}`,
      form.ghiChu,
    ]
      .filter(Boolean)
      .join(' | '),
  };
}
