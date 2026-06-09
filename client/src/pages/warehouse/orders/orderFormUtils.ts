import type { HubSummary, PaymentType, WaybillDetail } from './types';
import { emptyOrderForm } from './orderFormData';
import type { BillListItem, NewOrderFormState } from './orderFormTypes';

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

function waybillToOrderFormBase(waybill: WaybillDetail, hubs: HubSummary[]): NewOrderFormState {
  const destId = waybill.dest_hub_id ? String(waybill.dest_hub_id) : '';
  const originId = waybill.origin_hub_id ? String(waybill.origin_hub_id) : '';
  const destCode = waybill.dest_hub?.code?.toUpperCase() || hubCodeFromId(hubs, destId);
  const sender = parseContactInfo(waybill.sender_info);
  const receiver = parseContactInfo(waybill.receiver_info);
  const billingUnit = resolveBillingUnit(waybill);
  const unitPrice = resolveUnitPrice(waybill, billingUnit);

  return {
    ...emptyOrderForm(),
    maKh: waybill.ma_kh?.trim() || '',
    nguoiGui: waybill.sender_name?.trim() || sender.name || waybill.sender_info || '',
    diaChiGui: waybill.sender_address?.trim() || sender.address || '',
    dienThoaiKh: waybill.sender_phone?.trim() || sender.phone || '',
    dienThoaiNhan: waybill.receiver_phone?.trim() || receiver.phone || '',
    nguoiNhan: waybill.receiver_name?.trim() || receiver.name || waybill.receiver_info || '',
    diaChiNhan: waybill.receiver_address?.trim() || receiver.address || waybill.receiver_info || '',
    noiDen: destCode || 'HCM',
    originHubId: originId,
    destHubId: destId,
    huyen: waybill.dest_hub?.name || '',
    soBill: waybill.waybill_code || waybill.code || '',
    klKg: String(waybill.weight ?? ''),
    soKien: String(waybill.package_count ?? 1),
    klQuyDoi: String(waybill.volumetric_weight ?? waybill.weight ?? ''),
    m3: String((waybill as { the_tich_m3?: number }).the_tich_m3 ?? ''),
    donGia: unitPrice ? formatDonGia(String(unitPrice)) : '',
    donGiaDonVi: billingUnit,
    dvdb: formatDisplayNumber((waybill as { dvdb?: number }).dvdb, 0) || '0',
    cod: formatDonGia(String(waybill.cod_amount ?? '0')),
    giamGia: '0',
    phuongThuc: phuongThucFromWaybill(waybill),
    ghiChu: waybill.note || waybill.notes || '',
    xeLay: String((waybill as { xe_lay?: string }).xe_lay ?? ''),
    xePhat: String((waybill as { xe_phat?: string }).xe_phat ?? ''),
    trangThai: String(waybill.current_state || waybill.status || 'RECEIVED'),
  };
}

export function waybillToOrderForm(waybill: WaybillDetail, hubs: HubSummary[]): NewOrderFormState {
  const base = waybillToOrderFormBase(waybill, hubs);
  return applyPricingToForm(base);
}

export function waybillToBillItem(waybill: WaybillDetail): BillListItem {
  return {
    id: String(waybill.id),
    waybill_code: waybill.waybill_code || waybill.code || `#${waybill.id}`,
    package_count: Number(waybill.package_count) || 1,
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
  const weight = parseNumber(form.klKg);
  const volumeM3 = parseNumber(form.m3);

  return {
    waybill_code: form.soBill.trim().toUpperCase(),
    sender_name: form.nguoiGui.trim(),
    sender_phone: form.dienThoaiKh.trim() || '0900000000',
    sender_address: form.diaChiGui.trim() || form.nguoiGui.trim(),
    receiver_name: form.nguoiNhan.trim(),
    receiver_phone: normalizeVnPhone(form.dienThoaiNhan.trim()) || '0900000000',
    receiver_address: form.diaChiNhan.trim(),
    origin_hub_id: form.originHubId,
    dest_hub_id: form.destHubId,
    weight: weight || parseNumber(form.klQuyDoi) || 1,
    volumetric_weight: volumetricWeight,
    the_tich_m3: volumeM3,
    package_count: Math.max(1, parseInt(form.soKien, 10) || 1),
    freight_amount: freight,
    cod_amount: cod,
    cc_amount: paymentType === 'CC' ? freight : 0,
    xe_lay: form.xeLay.trim() || undefined,
    xe_phat: form.xePhat.trim() || undefined,
    note: [
      form.maKh && `ma_kh=${form.maKh}`,
      form.noiDung && `content=${form.noiDung}`,
      form.loaiBp && `loai_bp=${form.loaiBp}`,
      form.dichVu && `dich_vu=${form.dichVu}`,
      form.phuongThuc && `phuong_thuc=${form.phuongThuc}`,
      form.donGiaDonVi && `billing_unit=${form.donGiaDonVi}`,
      `unit_price=${parseMoneyAmount(form.donGia)}`,
      `dimensions_cm=${form.chieuDai}x${form.chieuRong}x${form.chieuCao}`,
      `volumetric_weight=${volumetricWeight}`,
      `the_tich_m3=${volumeM3}`,
      form.ghiChu,
    ]
      .filter(Boolean)
      .join(' | '),
  };
}
