import type { ManifestDispatchFields } from './types';

export type DispatchLink = {
  waybill_id?: string | number | null;
  loading_position?: string | number | null;
  loaded_at?: string | null;
  dispatch_fields?: ManifestDispatchFields | null;
  waybill?: {
    id?: string | number;
    waybill_code?: string | null;
    sender_info?: string | null;
    receiver_info?: string | null;
    receiver_phone?: string | null;
    receiver_address?: string | null;
    noi_den?: string | null;
    noi_dung?: string | null;
    note?: string | null;
    cod_amount?: number | string | null;
    package_count?: number | string | null;
    weight?: number | string | null;
    the_tich_m3?: number | string | null;
    volumetric_weight?: number | string | null;
    dest_hub?: { code?: string | null; name?: string | null } | null;
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return blank(value);
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date);
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
  return blank(waybill?.noi_den) || blank(waybill?.dest_hub?.code) || blank(waybill?.dest_hub?.name);
}

export function resolveDispatchDefault(link: DispatchLink, key: DispatchFieldKey): string {
  const waybill = link.waybill;
  switch (key) {
    case 'ngay_boc':
      return formatDispatchShortDate(link.loaded_at ?? null);
    case 'ma_tinh':
      return resolveMaTinh(waybill);
    case 'ten_cty':
      return parseSenderName(waybill?.sender_info);
    case 'dv':
      return 'TC';
    case 'mat_hang':
      return resolveGoodsContent(waybill) || blank(waybill?.waybill_code);
    case 'noi_tra':
      return '';
    case 'so_luong':
      return blank(waybill?.package_count) || '1';
    case 'loai':
      return 'kiện';
    case 'dia_chi':
      return formatReceiverAddressWithPhone(link);
    case 'ma_bill':
      return blank(waybill?.waybill_code);
    case 'ghi_chu_bill':
      return blank(waybill?.note);
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
  const saved = rows[rowKey]?.[key];
  return saved == null || saved === '' ? resolveDispatchDefault(link, key) : String(saved);
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
