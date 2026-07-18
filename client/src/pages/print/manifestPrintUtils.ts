import type { LoadPlanningManifest, ManifestDispatchFields, ManifestWaybill } from '../warehouse/manifests/types';
import {
  formatDispatchShortDate,
  parseReceiverPhone,
  parseSenderName,
  resolveDispatchDefault,
  resolveGoodsContent,
  resolveMaTinh,
  resolveReceiverDistrict,
  resolveReceiverWard,
  type DispatchLink,
} from '../warehouse/manifests/manifestDispatchDefaults';
import type { DispatchPrintRow } from './dispatchPrintFormat';
import { formatDispatchMoney } from './dispatchPrintFormat';
import type { LoadPlanningPrintGroup, LoadPlanningPrintPayload } from './loadPlanningPrintUtils';

type ManifestLink = DispatchLink & {
  waybill?: ManifestWaybill | null;
};

const fmt = (value?: string | number | null) => (value == null || value === '' ? '' : String(value));

function dispatchValue(fields: ManifestDispatchFields | null | undefined, key: string) {
  return fmt(fields?.[key] as string | number | null | undefined);
}

function normalizeLinks(manifest: LoadPlanningManifest): ManifestLink[] {
  if (manifest.manifest_waybills?.length) return manifest.manifest_waybills as ManifestLink[];
  return (manifest.waybills ?? []).map((waybill, index) => ({
    waybill_id: waybill.id,
    loading_position: waybill.loading_position ?? index + 1,
    dispatch_fields: waybill.dispatch_fields,
    waybill,
  }));
}

function mergedFields(link: ManifestLink): ManifestDispatchFields {
  return {
    ...(link.waybill?.dispatch_fields ?? {}),
    ...(link.dispatch_fields ?? {}),
  };
}

function fieldOrDefault(link: ManifestLink, key: Parameters<typeof resolveDispatchDefault>[1], fields: ManifestDispatchFields) {
  const saved = dispatchValue(fields, key);
  return saved || resolveDispatchDefault(link, key);
}

function mapLinkToRow(link: ManifestLink, index: number, showPricing: boolean): DispatchPrintRow {
  const waybill = link.waybill;
  const fields = mergedFields(link);

  const bcThuHoRaw = dispatchValue(fields, 'bc_thu_ho').replace(/\./g, '');
  const codRaw = dispatchValue(fields, 'cod').replace(/\./g, '') || dispatchValue(fields, 'lai_xe_thu_ho').replace(/\./g, '');
  const freight = Number(waybill?.cost_amount ?? (bcThuHoRaw ? Number(bcThuHoRaw) : 0));
  const cod = Number(codRaw || waybill?.cod_amount || 0);

  const receiverAddress = fieldOrDefault(link, 'dia_chi', fields);
  const phone = parseReceiverPhone(waybill?.receiver_info, waybill?.receiver_phone);

  return {
    viTriHang: fmt(link.loading_position ?? index + 1),
    ngayBoc: fieldOrDefault(link, 'ngay_boc', fields) || formatDispatchShortDate(link.loaded_at ?? null),
    maTinh: fieldOrDefault(link, 'ma_tinh', fields) || resolveMaTinh(waybill),
    quanHuyen: resolveReceiverDistrict(waybill),
    phuongXa: resolveReceiverWard(waybill),
    tenCtv: fieldOrDefault(link, 'ten_cty', fields) || parseSenderName(waybill?.sender_info),
    dv: fieldOrDefault(link, 'dv', fields) || 'TC',
    matHang: fieldOrDefault(link, 'mat_hang', fields) || resolveGoodsContent(waybill) || fmt(waybill?.waybill_code),
    matHangNote: '',
    noiTra: dispatchValue(fields, 'noi_tra'),
    soLuong: fieldOrDefault(link, 'so_luong', fields) || fmt(waybill?.package_count) || '1',
    donVi: fieldOrDefault(link, 'loai', fields) || 'kiện',
    nguoiNhanPhone: phone,
    nguoiNhanDiaChi: receiverAddress,
    diaChiNhan: receiverAddress,
    tinhTrangGiaoHang: dispatchValue(fields, 'trang_thai_giao'),
    ngayHoanThanh: dispatchValue(fields, 'ngay_hoan_thanh'),
    keHoach: dispatchValue(fields, 'ke_hoach'),
    tangHaThuKhach: formatDispatchMoney(cod),
    cuoc: showPricing ? formatDispatchMoney(freight) : '',
    laiXeThuHo: dispatchValue(fields, 'lai_xe_thu_ho'),
    bcThuHo: dispatchValue(fields, 'bc_thu_ho'),
    maBill: fieldOrDefault(link, 'ma_bill', fields) || fmt(waybill?.waybill_code),
    ghiChu: fieldOrDefault(link, 'ghi_chu_bill', fields),
    ghiChu1: dispatchValue(fields, 'ghi_chu_1'),
    ghiChu2: dispatchValue(fields, 'ghi_chu_2'),
    kg: fieldOrDefault(link, 'kg', fields),
    m3: fieldOrDefault(link, 'm3', fields),
    duKienToiHcm: dispatchValue(fields, 'du_kien_toi_hcm'),
    qd: dispatchValue(fields, 'qd'),
  };
}

function buildGroupTotals(rows: DispatchPrintRow[], showPricing: boolean) {
  return rows.reduce(
    (acc, row) => ({
      soLuong: acc.soLuong + (Number(row.soLuong) || 0),
      tangHaThuKhach:
        acc.tangHaThuKhach + Number(String(row.tangHaThuKhach).replace(/\./g, '').replace(/,/g, '') || 0),
      cuoc:
        acc.cuoc + (showPricing ? Number(String(row.cuoc).replace(/\./g, '').replace(/,/g, '') || 0) : 0),
      kg: acc.kg + (Number(row.kg) || 0),
      m3: acc.m3 + (Number(row.m3) || 0),
    }),
    { soLuong: 0, tangHaThuKhach: 0, cuoc: 0, kg: 0, m3: 0 },
  );
}

export function buildManifestPrintPayload(manifest: LoadPlanningManifest, showPricing: boolean): LoadPlanningPrintPayload {
  const trip = manifest.trip ?? manifest.trips?.[0] ?? null;
  const licensePlate = trip?.truck?.bks?.trim() || trip?.truck?.license_plate?.trim() || trip?.carrier_label?.trim() || '';
  const nhaXe = trip?.carrier_label?.trim() || '';
  const links = normalizeLinks(manifest).sort(
    (a, b) => Number(a.loading_position ?? 9999) - Number(b.loading_position ?? 9999),
  );
  const rows = links.map((link, index) => mapLinkToRow(link, index, showPricing));
  const group: LoadPlanningPrintGroup = {
    truckLabel: [licensePlate, nhaXe].filter(Boolean).join(' · ') || manifest.manifest_code || `BK-${manifest.id}`,
    licensePlate,
    nhaXe,
    manifestCode: manifest.manifest_code || manifest.code || `BK-${manifest.id}`,
    driverName: trip?.driver_name || trip?.driver?.name || trip?.truck?.ten_lai_xe || '',
    driverPhone: trip?.driver_phone || trip?.driver?.phone || trip?.truck?.phone || '',
    expectedArrival: trip?.expected_arrival_time || trip?.arrival_time || null,
    rows,
    totals: buildGroupTotals(rows, showPricing),
  };

  return {
    title: 'BẢNG KÊ PHÁT HÀNG ECO',
    printedAt: new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
    filterSummary: group.manifestCode,
    showPricing,
    groups: [group],
  };
}
