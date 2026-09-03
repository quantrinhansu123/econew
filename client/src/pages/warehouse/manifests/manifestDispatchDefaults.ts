import type { ManifestDispatchFields } from './types';
import { resolveVietnamDistrict, resolveVietnamWard } from '../../../lib/vietnamAddressParts';
import { resolveWaybillDisplayNote } from '../../../lib/waybillSpecialGoods';
import { resolveDeliveryProcessingText } from '../../delivery/last-mile/deliveryProcessingStatus';

export type DispatchLink = {
  waybill_id?: string | number | null;
  loading_position?: string | number | null;
  loaded_at?: string | null;
  dispatch_fields?: ManifestDispatchFields | null;
  waybill?: {
    id?: string | number;
    waybill_code?: string | null;
    sent_date?: string | null;
    sender_info?: string | null;
    receiver_info?: string | null;
    receiver_phone?: string | null;
    receiver_address?: string | null;
    receiver_district?: string | null;
    receiver_ward?: string | null;
    noi_den?: string | null;
    noi_dung?: string | null;
    note?: string | null;
    cod_amount?: number | string | null;
    cost_amount?: number | string | null;
    package_count?: number | string | null;
    weight?: number | string | null;
    the_tich_m3?: number | string | null;
    volumetric_weight?: number | string | null;
    current_state?: string | null;
    status?: string | null;
    delivery_preparation_status?: string | null;
    delivery_scheduled_at?: string | Date | null;
    delivery_hold_reason?: string | null;
    delivery_preparation_note?: string | null;
    delivery_assignment_type?: 'INTERNAL' | 'PARTNER' | 'TECHNOLOGY' | 'CUSTOMER_PICKUP' | null;
    route_code?: string | null;
    last_mile_driver_name?: string | null;
    last_mile_license_plate?: string | null;
    last_delivery_failure_reason?: string | null;
    delivery_time?: string | null;
    delivered_at?: string | null;
    returned_at?: string | null;
    delivery_photo_url?: string | null;
    dispatch_fields?: ManifestDispatchFields | null;
    dest_hub?: { id?: string | number | null; code?: string | null; name?: string | null; phone?: string | null; manager_phone?: string | null } | null;
    dest_hub_id?: string | number | null;
  } | null;
};

export type DispatchFieldKey =
  | 'ngay_boc'
  | 'ma_tinh'
  | 'ten_cty'
  | 'dv'
  | 'mat_hang'
  | 'noi_tra'
  | 'so_luong'
  | 'loai'
  | 'dia_chi'
  | 'trang_thai_giao'
  | 'ngay_hoan_thanh'
  | 'ke_hoach'
  | 'cod'
  | 'lai_xe_thu_ho'
  | 'bc_thu_ho'
  | 'ma_bill'
  | 'ghi_chu_bill'
  | 'ghi_chu_1'
  | 'ghi_chu_2'
  | 'kg'
  | 'm3'
  | 'qd'
  | 'du_kien_toi_hcm';

export const dispatchRowKey = (link: DispatchLink) => String(link.waybill_id ?? link.waybill?.id ?? '');

const blank = (value?: string | number | null) => (value == null || value === '' ? '' : String(value));

export const parseSenderName = (info?: string | null) => (info || '').split('|')[0]?.trim() || '';

export const parseReceiverPhone = (info?: string | null, phone?: string | null) => {
  if (phone?.trim()) return phone.trim();
  if (!info) return '';
  const parts = info.split('|').map((part) => part.trim());
  return parts[1] || '';
};

export const parseReceiverAddress = (info?: string | null, address?: string | null) => {
  if (address?.trim()) return address.trim();
  if (!info) return '';
  const parts = info.split('|').map((part) => part.trim());
  return parts.slice(2).join(' | ').trim() || parts[0] || '';
};

export const formatDispatchShortDate = (value?: string | null) => {
  if (!value) return '';
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}`;
  const dm = raw.match(/^(\d{1,2})\/(\d{1,2})/);
  if (dm) return `${dm[1].padStart(2, '0')}/${dm[2].padStart(2, '0')}`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return blank(value);
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
};

export function formatReceiverAddressWithPhone(link: DispatchLink) {
  const waybill = link.waybill;
  const address = parseReceiverAddress(waybill?.receiver_info, waybill?.receiver_address);
  const phone = parseReceiverPhone(waybill?.receiver_info, waybill?.receiver_phone);
  if (!address && !phone) return '';
  if (!phone) return address;
  if (!address) return `SĐT: ${phone}`;
  return `${address} · SĐT: ${phone}`;
}

export function resolveGoodsContent(waybill: DispatchLink['waybill']) {
  return blank(waybill?.noi_dung) || blank((waybill as { goods_description?: string | null } | undefined)?.goods_description);
}

export function resolveMaTinh(waybill: DispatchLink['waybill']) {
  return blank(waybill?.dest_hub?.code) || blank(waybill?.dest_hub?.name) || blank(waybill?.noi_den);
}

export function resolveDestinationWarehouse(waybill: DispatchLink['waybill']) {
  const code = blank(waybill?.dest_hub?.code).trim();
  const name = blank(waybill?.dest_hub?.name).trim();
  const hubId = blank(waybill?.dest_hub_id).trim();
  const destination =
    code && name && code.toLocaleLowerCase('vi') !== name.toLocaleLowerCase('vi')
      ? `${code} · ${name}`
      : code || name || (hubId ? `#${hubId}` : 'HUB đến');
  return `Kho ${destination}`;
}

const parseNoteField = (note: string | null | undefined, key: string) => {
  const match = String(note || '').match(new RegExp(`${key}=([^|]+)`, 'i'));
  return match?.[1]?.trim() || '';
};

export function resolveDispatchService(waybill: DispatchLink['waybill']) {
  const service = parseNoteField(waybill?.note, 'dich_vu');
  const normalized = service.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!service || normalized.includes('tieu chuan')) return 'TC';
  if (normalized.includes('nhanh 48')) return 'N48';
  if (normalized.includes('cham 4-6')) return 'C4-6';
  return service;
}

export function resolveDispatchDeliveryInstruction(waybill: DispatchLink['waybill']) {
  const method = parseNoteField(waybill?.note, 'giao_hang');
  if (/^(lay|nhan) tai (kho|van phong)/i.test(method.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) {
    return 'Nhận tại kho ECO';
  }
  return method || 'Tận nơi';
}

const formatDeliveryCompletionDate = (waybill: DispatchLink['waybill']) => {
  const state = String(waybill?.current_state || waybill?.status || '').toUpperCase();
  if (state !== 'DELIVERED') return '';
  return formatDispatchShortDate(waybill?.delivered_at || waybill?.delivery_time);
};

export function resolveReceiverDistrict(waybill: DispatchLink['waybill']) {
  const address = parseReceiverAddress(waybill?.receiver_info, waybill?.receiver_address);
  return resolveVietnamDistrict(
    waybill?.receiver_district || parseNoteField(waybill?.note, 'quan_huyen'),
    address,
  );
}

export function resolveReceiverWard(waybill: DispatchLink['waybill']) {
  const address = parseReceiverAddress(waybill?.receiver_info, waybill?.receiver_address);
  return resolveVietnamWard(
    waybill?.receiver_ward || parseNoteField(waybill?.note, 'phuong_xa'),
    address,
  );
}

export function resolveDispatchDefault(link: DispatchLink, key: DispatchFieldKey): string {
  const waybill = link.waybill;
  switch (key) {
    case 'ngay_boc':
      return formatDispatchShortDate(waybill?.sent_date ?? null);
    case 'ma_tinh':
      return resolveMaTinh(waybill);
    case 'ten_cty':
      return parseSenderName(waybill?.sender_info);
    case 'dv':
      return resolveDispatchService(waybill);
    case 'mat_hang':
      return resolveGoodsContent(waybill) || blank(waybill?.waybill_code);
    case 'noi_tra':
      return resolveDispatchDeliveryInstruction(waybill);
    case 'so_luong':
      return blank(waybill?.package_count) || '1';
    case 'loai':
      return 'kiện';
    case 'dia_chi':
      return formatReceiverAddressWithPhone(link);
    case 'trang_thai_giao':
      return resolveDeliveryProcessingText(waybill ?? {});
    case 'ngay_hoan_thanh':
      return formatDeliveryCompletionDate(waybill);
    case 'ke_hoach':
      return resolveDestinationWarehouse(waybill);
    case 'ma_bill':
      return blank(waybill?.waybill_code);
    case 'ghi_chu_bill':
      return resolveWaybillDisplayNote(waybill?.note);
    case 'cod':
      return blank(waybill?.cod_amount);
    case 'kg':
      return blank(waybill?.weight);
    case 'm3':
      return blank(waybill?.the_tich_m3 ?? waybill?.volumetric_weight);
    default:
      return '';
  }
}

export function getDispatchCellValue(
  rows: Record<string, ManifestDispatchFields>,
  link: DispatchLink,
  rowKey: string,
  key: DispatchFieldKey,
): string {
  if (key === 'ngay_boc' || key === 'dv' || key === 'noi_tra' || key === 'trang_thai_giao' || key === 'ngay_hoan_thanh') {
    return resolveDispatchDefault(link, key);
  }
  const saved = rows[rowKey]?.[key];
  const value = saved == null || saved === '' ? resolveDispatchDefault(link, key) : String(saved);
  return key === 'ghi_chu_bill' ? resolveWaybillDisplayNote(value) : value;
}

export function computeDispatchTotals(
  links: DispatchLink[],
  rows: Record<string, ManifestDispatchFields>,
  rowKeyFn: (link: DispatchLink) => string,
) {
  let soLuong = 0;
  let cod = 0;
  let kg = 0;
  let m3 = 0;
  const units = new Set<string>();

  for (const link of links) {
    const rowKey = rowKeyFn(link);
    const qty = Number(getDispatchCellValue(rows, link, rowKey, 'so_luong')) || 0;
    const unit = getDispatchCellValue(rows, link, rowKey, 'loai').trim() || 'kiện';
    const codRaw = getDispatchCellValue(rows, link, rowKey, 'cod').replace(/\./g, '').replace(/,/g, '');
    const kgRaw = getDispatchCellValue(rows, link, rowKey, 'kg');
    const m3Raw = getDispatchCellValue(rows, link, rowKey, 'm3');

    soLuong += qty;
    cod += Number(codRaw) || 0;
    kg += Number(kgRaw) || 0;
    m3 += Number(m3Raw) || 0;
    if (unit) units.add(unit);
  }

  const unitLabel = units.size === 1 ? Array.from(units)[0] : 'kiện';
  return { soLuong, cod, kg, m3: Number(m3.toFixed(2)), unitLabel };
}
