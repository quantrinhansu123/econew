import {
  utils,
  writeFile,
  type CellObject,
  type CellStyle,
  type WorkBook,
  type WorkSheet,
} from 'xlsx';
import type { InventoryColumnId } from './inventoryColumns';
import {
  ALL_ORDERS_FINANCIAL_COLUMN_IDS,
  ALL_ORDERS_PREFIX_COLUMN_IDS,
  ALL_ORDERS_SENDER_COLUMN_IDS,
  INVENTORY_COLUMNS,
  computeGrandTotals,
  formatInventoryDate,
  resolveAllOrdersColumnLabel,
  resolveBillingUnit,
  resolveBillingQtyDetail,
  resolveCongSg,
  resolveCustomerName,
  resolveFreight,
  resolveLoadedAt,
  resolveMaKh,
  resolveNoiDen,
  resolveOrderStatusBadge,
  resolvePackageCountSl,
  resolvePaymentMethod,
  resolvePrintColumnIds,
  resolveReceiverAddress,
  resolveReceiverDistrict,
  resolveReceiverPhone,
  resolveReceiverWard,
  resolveRoute,
  resolveServiceType,
  resolveSurcharge,
  resolveTotalAmount,
  resolveTransitFee,
  resolveUnitPrice,
  resolveUserNote,
  resolveVolumeM3,
  resolveWeightKg,
} from './inventoryColumns';
import type { WaybillInventoryItem } from './types';
import { inventoryPrintCellValue } from '../../print/inventoryPrintUtils';

type ExcelValue = string | number;

export type InventoryExcelVariant = 'split-pending' | 'all-orders';

const COLORS = {
  navy: '1E3A8A',
  navyLight: 'DBEAFE',
  slate: '475569',
  slateLight: 'F1F5F9',
  border: 'CBD5E1',
  white: 'FFFFFF',
  skyHeader: 'E0F2FE',
  skyText: '0C4A6E',
  violetHeader: 'F5F3FF',
  violetText: '4C1D95',
  orangeHeader: 'FFF7ED',
  orangeText: '9A3412',
  greenHeader: 'D1FAE5',
  greenText: '065F46',
  yellowHeader: 'FEF9C3',
  yellowText: '854D0E',
  alternate: 'F8FAFC',
} as const;

const MONEY_COLUMN_IDS = new Set<InventoryColumnId>([
  'unit_price',
  'surcharge',
  'transit_fee',
  'total_amount',
  'thu_ho_khach',
  'freight',
  'cod_amount',
]);

const NUMBER_FORMAT_BY_COLUMN: Partial<Record<InventoryColumnId, string>> = {
  unit_price: '#,##0 "đ"',
  surcharge: '#,##0 "đ"',
  transit_fee: '#,##0 "đ"',
  total_amount: '#,##0 "đ"',
  thu_ho_khach: '#,##0 "đ"',
  freight: '#,##0 "đ"',
  cod_amount: '#,##0 "đ"',
  weight: '#,##0.0',
  volume: '0.00',
};

const EXCEL_COLUMN_WIDTHS: Partial<Record<InventoryColumnId, number>> = {
  stt: 7,
  stack_position: 11,
  order_code: 18,
  customer_name: 24,
  waybill_code: 21,
  bill_info: 24,
  cong_sg: 25,
  service_type: 16,
  trip_label: 20,
  loaded_at: 14,
  received_at: 14,
  noi_den: 14,
  order_status: 18,
  billing_unit: 11,
  billing_qty_detail: 23,
  unit_price: 16,
  surcharge: 15,
  transit_fee: 16,
  total_amount: 17,
  thu_ho_khach: 17,
  payment_method: 22,
  customer_payment_status: 19,
  customer_payment_note: 30,
  route: 16,
  ma_kh: 16,
  receiver_address: 42,
  receiver_district: 22,
  receiver_ward: 22,
  receiver_phone: 18,
  package_count: 14,
  weight: 17,
  volume: 16,
  sender_info: 34,
  receiver_info: 34,
  current_hub: 24,
  dest_hub: 24,
  payment_type: 12,
  cod_amount: 16,
  priority: 14,
};

const border: NonNullable<CellStyle['border']> = {
  top: { style: 'thin', color: { rgb: COLORS.border } },
  right: { style: 'thin', color: { rgb: COLORS.border } },
  bottom: { style: 'thin', color: { rgb: COLORS.border } },
  left: { style: 'thin', color: { rgb: COLORS.border } },
};

const baseCellStyle: CellStyle = {
  font: { name: 'Arial', sz: 10, color: { rgb: '0F172A' } },
  alignment: { vertical: 'center', wrapText: true },
  border,
};

const titleStyle: CellStyle = {
  font: { name: 'Arial', sz: 16, bold: true, color: { rgb: COLORS.white } },
  fill: { patternType: 'solid', fgColor: { rgb: COLORS.navy } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
};

const metaStyle: CellStyle = {
  font: { name: 'Arial', sz: 10, italic: true, color: { rgb: COLORS.slate } },
  fill: { patternType: 'solid', fgColor: { rgb: COLORS.slateLight } },
  alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
};

const defaultHeaderStyle: CellStyle = {
  font: { name: 'Arial', sz: 10, bold: true, color: { rgb: COLORS.slate } },
  fill: { patternType: 'solid', fgColor: { rgb: COLORS.slateLight } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border,
};

const totalStyle: CellStyle = {
  font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '0F172A' } },
  fill: { patternType: 'solid', fgColor: { rgb: COLORS.navyLight } },
  alignment: { vertical: 'center', wrapText: true },
  border,
};

const detailColumns: Array<{
  label: string;
  width: number;
  align?: 'left' | 'center' | 'right';
  numFmt?: string;
  value: (waybill: WaybillInventoryItem, index: number) => ExcelValue;
}> = [
  { label: 'STT', width: 7, align: 'center', value: (_waybill, index) => index + 1 },
  { label: 'Mã KH', width: 16, value: (waybill) => resolveMaKh(waybill).replace(/^—$/, '') },
  { label: 'Mã bill', width: 20, value: displayCode },
  { label: 'BC gửi', width: 18, value: (waybill) => hubCode(waybill.origin_hub, waybill.origin_hub_id) },
  { label: 'BC đến', width: 18, value: (waybill) => hubCode(waybill.dest_hub, waybill.dest_hub_id) },
  { label: 'Điện thoại KH', width: 18, value: billSenderPhone },
  { label: 'Người gửi', width: 28, value: billSenderName },
  { label: 'Địa chỉ gửi', width: 42, value: billSenderAddress },
  { label: 'Người nhận', width: 28, value: billReceiverName },
  { label: 'ĐT người nhận', width: 18, value: billReceiverPhone },
  { label: 'Địa chỉ nhận', width: 42, value: billReceiverAddress },
  { label: 'Nơi đến', width: 18, value: billDestination },
  { label: 'Quận/Huyện', width: 22, value: resolveReceiverDistrict },
  { label: 'Phường/Xã', width: 22, value: resolveReceiverWard },
  {
    label: 'Số kiện',
    width: 12,
    align: 'right',
    numFmt: '#,##0',
    value: billPackageCount,
  },
  { label: 'Loại BP', width: 14, value: (waybill) => noteField(waybill, 'loai_bp') },
  { label: 'Dịch vụ', width: 18, value: (waybill) => noteField(waybill, 'dich_vu') },
  { label: 'Giao hàng', width: 18, value: (waybill) => noteField(waybill, 'giao_hang') },
  { label: 'Ngày gửi', width: 16, value: billSentDate },
  { label: 'ĐVT', width: 13, value: (waybill) => resolveBillingUnit(waybill) },
  {
    label: 'Số cân (kg)',
    width: 16,
    align: 'right',
    numFmt: '#,##0.###',
    value: billWeight,
  },
  {
    label: 'KL quy đổi (kg)',
    width: 18,
    align: 'right',
    numFmt: '#,##0.###',
    value: billVolumetricWeight,
  },
  {
    label: 'Số khối (m³)',
    width: 16,
    align: 'right',
    numFmt: '#,##0.###',
    value: billVolumeM3,
  },
  { label: 'Dài (cm)', width: 12, align: 'right', numFmt: '#,##0.##', value: (waybill) => billDimensions(waybill)[0] },
  { label: 'Rộng (cm)', width: 12, align: 'right', numFmt: '#,##0.##', value: (waybill) => billDimensions(waybill)[1] },
  { label: 'Cao (cm)', width: 12, align: 'right', numFmt: '#,##0.##', value: (waybill) => billDimensions(waybill)[2] },
  { label: 'NVGN', width: 18, value: (waybill) => noteField(waybill, 'nvgn') },
  { label: 'Dịch vụ GTGT', width: 20, value: (waybill) => noteField(waybill, 'dich_vu_gia_tang') },
  { label: 'Nội dung', width: 30, value: (waybill) => resolveCongSg(waybill).replace(/^—$/, '') },
  { label: 'Ghi chú', width: 36, value: billUserNote },
  { label: 'Phương thức', width: 22, value: (waybill) => resolvePaymentMethod(waybill) },
  { label: 'Đơn giá', width: 16, align: 'right', numFmt: '#,##0 "đ"', value: (waybill) => resolveUnitPrice(waybill) },
  { label: 'Cước chính', width: 16, align: 'right', numFmt: '#,##0 "đ"', value: billFreight },
  { label: 'Phụ phí', width: 16, align: 'right', numFmt: '#,##0 "đ"', value: (waybill) => resolveSurcharge(waybill) },
  { label: 'Thành tiền', width: 16, align: 'right', numFmt: '#,##0 "đ"', value: (waybill) => resolveTotalAmount(waybill) },
  { label: 'COD', width: 16, align: 'right', numFmt: '#,##0 "đ"', value: billCod },
];

function finiteNumber(value: unknown): number | string {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
}

function displayCode(waybill: WaybillInventoryItem): string {
  return String(waybill.waybill_code || waybill.code || waybill.id).replace(/[-\s]+/g, '');
}

function contactPart(value: string | null | undefined, index: number): string {
  return String(value || '').split('|')[index]?.trim() || '';
}

function sourceNote(waybill: WaybillInventoryItem): string {
  return String(waybill.note || waybill.notes || waybill.order?.note || '');
}

function noteField(waybill: WaybillInventoryItem, key: string): string {
  const match = sourceNote(waybill).match(new RegExp(`${key}=([^|]+)`, 'i'));
  return match?.[1]?.trim() || '';
}

function hubCode(
  hub?: { id?: string | number; code?: string | null; name?: string | null } | null,
  fallback?: string | number | null,
): string {
  return hub?.code?.trim().toUpperCase() || (fallback ? `#${fallback}` : '');
}

function billSenderName(waybill: WaybillInventoryItem): string {
  return waybill.sender_name?.trim()
    || waybill.order?.sender_name?.trim()
    || contactPart(waybill.sender_info, 0);
}

function billSenderPhone(waybill: WaybillInventoryItem): string {
  return waybill.sender_phone?.trim()
    || waybill.order?.sender_phone?.trim()
    || contactPart(waybill.sender_info, 1);
}

function billSenderAddress(waybill: WaybillInventoryItem): string {
  return waybill.sender_address?.trim()
    || waybill.order?.sender_address?.trim()
    || contactPart(waybill.sender_info, 2);
}

function billReceiverName(waybill: WaybillInventoryItem): string {
  return waybill.receiver_name?.trim()
    || waybill.order?.receiver_name?.trim()
    || contactPart(waybill.receiver_info, 0);
}

function billReceiverPhone(waybill: WaybillInventoryItem): string {
  return waybill.receiver_phone?.trim()
    || waybill.order?.receiver_phone?.trim()
    || contactPart(waybill.receiver_info, 1);
}

function billReceiverAddress(waybill: WaybillInventoryItem): string {
  return waybill.receiver_address?.trim()
    || waybill.order?.receiver_address?.trim()
    || contactPart(waybill.receiver_info, 2);
}

function billDestination(waybill: WaybillInventoryItem): string {
  return waybill.noi_den?.trim()
    || noteField(waybill, 'tinh_den')
    || waybill.dest_hub?.code?.trim().toUpperCase()
    || '';
}

function billPackageCount(waybill: WaybillInventoryItem): number | string {
  return finiteNumber(
    waybill.package_count
    ?? waybill.declared_package_count
    ?? waybill.order?.package_count,
  );
}

function billWeight(waybill: WaybillInventoryItem): number | string {
  return finiteNumber(waybill.weight ?? waybill.order?.weight);
}

function billVolumetricWeight(waybill: WaybillInventoryItem): number | string {
  return finiteNumber(waybill.volumetric_weight ?? noteField(waybill, 'volumetric_weight'));
}

function billVolumeM3(waybill: WaybillInventoryItem): number | string {
  return finiteNumber(waybill.the_tich_m3 ?? noteField(waybill, 'the_tich_m3'));
}

function billDimensions(waybill: WaybillInventoryItem): [number | string, number | string, number | string] {
  const stored = [waybill.length, waybill.width, waybill.height].map(finiteNumber);
  if (stored.some((value) => Number(value) > 0)) {
    return stored as [number | string, number | string, number | string];
  }
  const parsed = noteField(waybill, 'dimensions_cm')
    .split('x')
    .map((value) => finiteNumber(value.trim()));
  return parsed.length === 3
    ? parsed as [number | string, number | string, number | string]
    : ['', '', ''];
}

function billSentDate(waybill: WaybillInventoryItem): string {
  const entered = noteField(waybill, 'ngay_gui');
  return formatInventoryDate(entered || waybill.created_at || waybill.received_at);
}

function billFreight(waybill: WaybillInventoryItem): number | string {
  return finiteNumber(
    waybill.freight_amount
    ?? waybill.cost_amount
    ?? waybill.order?.freight_amount
    ?? noteField(waybill, 'cuoc_chinh'),
  );
}

function billCod(waybill: WaybillInventoryItem): number | string {
  return finiteNumber(waybill.cod_amount ?? waybill.order?.cod_amount);
}

function billUserNote(waybill: WaybillInventoryItem): string {
  return resolveUserNote({ note: sourceNote(waybill), notes: null });
}

function billBillingQtyDetail(waybill: WaybillInventoryItem): string {
  const kg = Number(billWeight(waybill) || 0);
  const volumetricKg = Number(billVolumetricWeight(waybill) || 0);
  const m3 = Number(billVolumeM3(waybill) || 0);
  const unit = resolveBillingUnit(waybill);
  const parts: string[] = [];
  if (kg > 0) parts.push(`${kg.toLocaleString('vi-VN', { maximumFractionDigits: 3 })} kg`);
  if (volumetricKg > 0) parts.push(`${volumetricKg.toLocaleString('vi-VN', { maximumFractionDigits: 3 })} kg quy đổi`);
  if (m3 > 0) parts.push(`${m3.toLocaleString('vi-VN', { maximumFractionDigits: 3 })} m³`);
  return parts.length ? `${parts.join(' · ')} (${unit})` : '';
}

function inventoryExcelCellValue(
  waybill: WaybillInventoryItem,
  colId: InventoryColumnId,
  showPricing: boolean,
  rowIndex: number,
  variant: InventoryExcelVariant,
): ExcelValue {
  switch (colId) {
    case 'stt':
      return rowIndex;
    case 'received_at':
      return variant === 'all-orders'
        ? billSentDate(waybill)
        : formatInventoryDate(waybill.received_at || waybill.created_at);
    case 'cong_sg':
      return resolveCongSg(waybill);
    case 'customer_name':
      return resolveCustomerName(waybill);
    case 'waybill_code':
      return displayCode(waybill);
    case 'service_type':
      return resolveServiceType(waybill);
    case 'noi_den':
      return resolveNoiDen(waybill);
    case 'receiver_address':
      return resolveReceiverAddress(waybill);
    case 'receiver_phone':
      return resolveReceiverPhone(waybill).replace(/^—$/, '');
    case 'order_status':
      return resolveOrderStatusBadge(waybill).label;
    case 'package_count':
      return variant === 'all-orders'
        ? finiteNumber(resolvePackageCountSl(waybill))
        : inventoryPrintCellValue(waybill, colId, showPricing, rowIndex);
    case 'billing_unit':
      return resolveBillingUnit(waybill);
    case 'billing_qty_detail':
      return variant === 'all-orders'
        ? billBillingQtyDetail(waybill)
        : resolveBillingQtyDetail(waybill);
    case 'unit_price':
      return finiteNumber(resolveUnitPrice(waybill));
    case 'surcharge':
      return showPricing ? resolveSurcharge(waybill) : '';
    case 'transit_fee':
      return resolveTransitFee(waybill);
    case 'total_amount':
      return showPricing ? resolveTotalAmount(waybill) : '';
    case 'thu_ho_khach':
      return finiteNumber(waybill.allocated_cod ?? waybill.cod_amount) || 0;
    case 'customer_payment_status':
      return waybill.customer_payment_status === 'PAID'
        ? 'Đã TT'
        : waybill.customer_payment_status === 'SENT_STATEMENT'
          ? 'Đã gửi bảng kê'
          : '';
    case 'payment_method':
      return resolvePaymentMethod(waybill);
    case 'customer_payment_note':
      return variant === 'all-orders'
        ? billUserNote(waybill)
        : waybill.customer_payment_note || '';
    case 'route':
      return resolveRoute(waybill).replace(/^—$/, '');
    case 'ma_kh':
      return resolveMaKh(waybill).replace(/^—$/, '');
    case 'loaded_at':
      return formatInventoryDate(resolveLoadedAt(waybill));
    case 'weight':
      return variant === 'all-orders'
        ? billWeight(waybill)
        : resolveWeightKg(waybill) || '';
    case 'volume':
      return variant === 'all-orders'
        ? billVolumeM3(waybill)
        : resolveVolumeM3(waybill) || '';
    case 'freight':
      return showPricing ? resolveFreight(waybill) : '';
    case 'cod_amount':
      return finiteNumber(waybill.cod_amount);
    default:
      return inventoryPrintCellValue(waybill, colId, showPricing, rowIndex);
  }
}

function columnLabel(id: InventoryColumnId, variant: InventoryExcelVariant): string {
  return variant === 'all-orders'
    ? resolveAllOrdersColumnLabel(id)
    : INVENTORY_COLUMNS.find((column) => column.id === id)?.label ?? id;
}

function makeTotalRow(
  waybills: WaybillInventoryItem[],
  printColumnIds: InventoryColumnId[],
  showPricing: boolean,
  variant: InventoryExcelVariant,
): ExcelValue[] {
  const totals = variant === 'all-orders'
    ? computeBillTotals(waybills)
    : computeGrandTotals(waybills, false);
  const totalLabelCol =
    printColumnIds.find((id) => id === 'waybill_code')
    ?? printColumnIds.find((id) => id === 'order_code')
    ?? printColumnIds[0];
  const totalAmount = waybills.reduce((sum, waybill) => sum + resolveTotalAmount(waybill), 0);
  const surcharge = waybills.reduce((sum, waybill) => sum + resolveSurcharge(waybill), 0);
  const transitFee = waybills.reduce((sum, waybill) => sum + resolveTransitFee(waybill), 0);
  const collect = waybills.reduce(
    (sum, waybill) => sum + Number(waybill.allocated_cod ?? waybill.cod_amount ?? 0),
    0,
  );

  return printColumnIds.map((id) => {
    if (id === totalLabelCol) return 'TỔNG CỘNG';
    if (id === 'package_count') return totals.package_count;
    if (id === 'weight') return totals.weight_kg;
    if (id === 'volume') return totals.volume_m3;
    if (id === 'total_amount') return showPricing ? totalAmount : '';
    if (id === 'surcharge') return showPricing ? surcharge : '';
    if (id === 'transit_fee') return transitFee;
    if (id === 'thu_ho_khach') return collect;
    return '';
  });
}

function computeBillTotals(waybills: WaybillInventoryItem[]) {
  return waybills.reduce(
    (total, waybill) => ({
      package_count: total.package_count + Number(billPackageCount(waybill) || 0),
      weight_kg: total.weight_kg + Number(billWeight(waybill) || 0),
      volume_m3: total.volume_m3 + Number(billVolumeM3(waybill) || 0),
      freight: 0,
    }),
    { package_count: 0, weight_kg: 0, volume_m3: 0, freight: 0 },
  );
}

function allOrdersHeaderRows(printColumnIds: InventoryColumnId[]): {
  rows: ExcelValue[][];
  merges: NonNullable<WorkSheet['!merges']>;
} {
  const groupRow = printColumnIds.map(() => '');
  const headerRow = printColumnIds.map((id) => columnLabel(id, 'all-orders'));
  const merges: NonNullable<WorkSheet['!merges']> = [];

  const mergeGroup = (ids: InventoryColumnId[], label: string) => {
    const indexes = printColumnIds
      .map((id, index) => (ids.includes(id) ? index : -1))
      .filter((index) => index >= 0);
    if (!indexes.length) return;
    const start = Math.min(...indexes);
    const end = Math.max(...indexes);
    groupRow[start] = label;
    if (end > start) merges.push({ s: { r: 3, c: start }, e: { r: 3, c: end } });
  };

  mergeGroup(ALL_ORDERS_SENDER_COLUMN_IDS, 'THÔNG TIN NGƯỜI GỬI');
  mergeGroup(ALL_ORDERS_FINANCIAL_COLUMN_IDS, 'THÔNG TIN THANH TOÁN');

  printColumnIds.forEach((id, index) => {
    const isStandalone =
      ALL_ORDERS_PREFIX_COLUMN_IDS.includes(id)
      || (!ALL_ORDERS_SENDER_COLUMN_IDS.includes(id) && !ALL_ORDERS_FINANCIAL_COLUMN_IDS.includes(id));
    if (!isStandalone) return;
    groupRow[index] = columnLabel(id, 'all-orders');
    headerRow[index] = '';
    merges.push({ s: { r: 3, c: index }, e: { r: 4, c: index } });
  });

  return { rows: [groupRow, headerRow], merges };
}

export function buildInventoryExcelRows(
  waybills: WaybillInventoryItem[],
  visibleColumnIds: InventoryColumnId[],
  showPricing: boolean,
  filterSummary: string,
  variant: InventoryExcelVariant = 'split-pending',
): ExcelValue[][] {
  const printColumnIds = resolvePrintColumnIds(visibleColumnIds);
  const headers = printColumnIds.map((id) => columnLabel(id, variant));
  const dataRows = waybills.map((waybill, index) =>
    printColumnIds.map((colId) => inventoryExcelCellValue(
      waybill,
      colId,
      showPricing,
      index + 1,
      variant,
    )),
  );
  const printedAt = new Date().toLocaleString('vi-VN');
  const meta = filterSummary ? `Xuất lúc: ${printedAt} · ${filterSummary}` : `Xuất lúc: ${printedAt}`;
  const headerRows = variant === 'all-orders' ? allOrdersHeaderRows(printColumnIds).rows : [headers];
  const totals = variant === 'all-orders'
    ? computeBillTotals(waybills)
    : computeGrandTotals(waybills, false);

  return [
    [variant === 'all-orders' ? 'DANH SÁCH ĐƠN HÀNG ECO' : 'DANH SÁCH TỒN KHO ECO'],
    [meta],
    [],
    ...headerRows,
    ...dataRows,
    makeTotalRow(waybills, printColumnIds, showPricing, variant),
    [`Tổng đơn: ${waybills.length.toLocaleString('vi-VN')} · Tổng kiện: ${totals.package_count.toLocaleString('vi-VN')} · Tổng cân: ${totals.weight_kg.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg · Tổng khối: ${totals.volume_m3.toFixed(2)} m³`],
  ];
}

function setCellStyle(
  worksheet: WorkSheet,
  rowIndex: number,
  columnIndex: number,
  style: CellStyle,
) {
  const address = utils.encode_cell({ r: rowIndex, c: columnIndex });
  const cell = worksheet[address] as CellObject | undefined;
  if (cell) cell.s = style;
}

function headerStyleForColumn(id: InventoryColumnId): CellStyle {
  if (id === 'surcharge') {
    return {
      ...defaultHeaderStyle,
      font: { ...defaultHeaderStyle.font, color: { rgb: COLORS.orangeText } },
      fill: { patternType: 'solid', fgColor: { rgb: COLORS.orangeHeader } },
    };
  }
  if (id === 'total_amount') {
    return {
      ...defaultHeaderStyle,
      font: { ...defaultHeaderStyle.font, color: { rgb: COLORS.greenText } },
      fill: { patternType: 'solid', fgColor: { rgb: COLORS.greenHeader } },
    };
  }
  if (id === 'customer_payment_status') {
    return {
      ...defaultHeaderStyle,
      font: { ...defaultHeaderStyle.font, color: { rgb: COLORS.yellowText } },
      fill: { patternType: 'solid', fgColor: { rgb: COLORS.yellowHeader } },
    };
  }
  return defaultHeaderStyle;
}

function dataFillForColumn(id: InventoryColumnId, alternate: boolean): string {
  if (id === 'surcharge') return 'FFFBEB';
  if (id === 'total_amount') return 'ECFDF5';
  if (id === 'customer_payment_status') return 'FEFCE8';
  return alternate ? COLORS.alternate : COLORS.white;
}

function alignmentForColumn(id: InventoryColumnId): NonNullable<CellStyle['alignment']> {
  const definition = INVENTORY_COLUMNS.find((column) => column.id === id);
  const horizontal = definition?.align
    ?? (MONEY_COLUMN_IDS.has(id) || ['stt', 'package_count', 'weight', 'volume'].includes(id)
      ? 'right'
      : 'left');
  return { horizontal, vertical: 'center', wrapText: true };
}

function estimateRowHeight(values: ExcelValue[], widths: number[]): number {
  const lineCount = values.reduce<number>((max, value, index) => {
    const text = String(value ?? '');
    const width = Math.max(6, widths[index] - 2);
    const lines = text
      .split(/\r?\n/)
      .reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / width)), 0);
    return Math.max(max, lines);
  }, 1);
  return Math.min(72, Math.max(22, lineCount * 15));
}

function styleInventoryWorksheet(
  worksheet: WorkSheet,
  rows: ExcelValue[][],
  printColumnIds: InventoryColumnId[],
  dataCount: number,
  variant: InventoryExcelVariant,
) {
  const columnCount = printColumnIds.length;
  const headerStartRow = 3;
  const headerEndRow = variant === 'all-orders' ? 4 : 3;
  const dataStartRow = headerEndRow + 1;
  const dataEndRow = dataStartRow + dataCount - 1;
  const totalRow = dataEndRow + 1;
  const summaryRow = totalRow + 1;
  const widths = printColumnIds.map((id) => EXCEL_COLUMN_WIDTHS[id] ?? 16);

  worksheet['!cols'] = widths.map((wch) => ({ wch }));
  worksheet['!rows'] = rows.map((row, index) => {
    if (index === 0) return { hpt: 30 };
    if (index === 1) return { hpt: 24 };
    if (index === 2) return { hpt: 8 };
    if (index >= headerStartRow && index <= headerEndRow) return { hpt: 30 };
    if (index >= dataStartRow && index <= dataEndRow) return { hpt: estimateRowHeight(row, widths) };
    return { hpt: 25 };
  });

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    setCellStyle(worksheet, 0, columnIndex, titleStyle);
    setCellStyle(worksheet, 1, columnIndex, metaStyle);
  }

  if (variant === 'all-orders') {
    printColumnIds.forEach((id, columnIndex) => {
      const groupStyle = ALL_ORDERS_SENDER_COLUMN_IDS.includes(id)
        ? {
            ...defaultHeaderStyle,
            font: { ...defaultHeaderStyle.font, color: { rgb: COLORS.skyText } },
            fill: { patternType: 'solid' as const, fgColor: { rgb: COLORS.skyHeader } },
          }
        : ALL_ORDERS_FINANCIAL_COLUMN_IDS.includes(id)
          ? {
              ...defaultHeaderStyle,
              font: { ...defaultHeaderStyle.font, color: { rgb: COLORS.violetText } },
              fill: { patternType: 'solid' as const, fgColor: { rgb: COLORS.violetHeader } },
            }
          : defaultHeaderStyle;
      setCellStyle(worksheet, headerStartRow, columnIndex, groupStyle);
      setCellStyle(worksheet, headerEndRow, columnIndex, headerStyleForColumn(id));
    });
  } else {
    printColumnIds.forEach((id, columnIndex) => {
      setCellStyle(worksheet, headerEndRow, columnIndex, headerStyleForColumn(id));
    });
  }

  for (let rowIndex = dataStartRow; rowIndex <= dataEndRow; rowIndex += 1) {
    printColumnIds.forEach((id, columnIndex) => {
      const style: CellStyle = {
        ...baseCellStyle,
        alignment: alignmentForColumn(id),
        fill: {
          patternType: 'solid',
          fgColor: { rgb: dataFillForColumn(id, (rowIndex - dataStartRow) % 2 === 1) },
        },
        ...(NUMBER_FORMAT_BY_COLUMN[id] ? { numFmt: NUMBER_FORMAT_BY_COLUMN[id] } : {}),
      };
      setCellStyle(worksheet, rowIndex, columnIndex, style);
    });
  }

  printColumnIds.forEach((id, columnIndex) => {
    setCellStyle(worksheet, totalRow, columnIndex, {
      ...totalStyle,
      alignment: alignmentForColumn(id),
      ...(NUMBER_FORMAT_BY_COLUMN[id] ? { numFmt: NUMBER_FORMAT_BY_COLUMN[id] } : {}),
    });
    setCellStyle(worksheet, summaryRow, columnIndex, metaStyle);
  });

  if (dataCount > 0) {
    worksheet['!autofilter'] = {
      ref: utils.encode_range({
        s: { r: headerEndRow, c: 0 },
        e: { r: dataEndRow, c: columnCount - 1 },
      }),
    };
  }
  worksheet['!margins'] = {
    left: 0.3,
    right: 0.3,
    top: 0.5,
    bottom: 0.5,
    header: 0.2,
    footer: 0.2,
  };
}

function buildDetailWorksheet(
  waybills: WaybillInventoryItem[],
  filterSummary: string,
): WorkSheet {
  const printedAt = new Date().toLocaleString('vi-VN');
  const meta = filterSummary ? `Xuất lúc: ${printedAt} · ${filterSummary}` : `Xuất lúc: ${printedAt}`;
  const rows: ExcelValue[][] = [
    ['CHI TIẾT ĐƠN HÀNG'],
    [meta],
    [],
    detailColumns.map((column) => column.label),
    ...waybills.map((waybill, index) => detailColumns.map((column) => column.value(waybill, index))),
  ];
  const worksheet = utils.aoa_to_sheet(rows);
  const columnCount = detailColumns.length;
  const dataStartRow = 4;
  const dataEndRow = dataStartRow + waybills.length - 1;

  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: columnCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: columnCount - 1 } },
  ];
  worksheet['!cols'] = detailColumns.map((column) => ({ wch: column.width }));
  worksheet['!rows'] = rows.map((row, index) => {
    if (index === 0) return { hpt: 30 };
    if (index === 1) return { hpt: 24 };
    if (index === 2) return { hpt: 8 };
    if (index === 3) return { hpt: 32 };
    return { hpt: estimateRowHeight(row, detailColumns.map((column) => column.width)) };
  });

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    setCellStyle(worksheet, 0, columnIndex, titleStyle);
    setCellStyle(worksheet, 1, columnIndex, metaStyle);
    setCellStyle(worksheet, 3, columnIndex, {
      ...defaultHeaderStyle,
      font: { ...defaultHeaderStyle.font, color: { rgb: COLORS.white } },
      fill: { patternType: 'solid', fgColor: { rgb: COLORS.navy } },
    });
  }

  for (let rowIndex = dataStartRow; rowIndex <= dataEndRow; rowIndex += 1) {
    detailColumns.forEach((column, columnIndex) => {
      setCellStyle(worksheet, rowIndex, columnIndex, {
        ...baseCellStyle,
        alignment: {
          horizontal: column.align ?? 'left',
          vertical: 'center',
          wrapText: true,
        },
        fill: {
          patternType: 'solid',
          fgColor: { rgb: (rowIndex - dataStartRow) % 2 === 1 ? COLORS.alternate : COLORS.white },
        },
        ...(column.numFmt ? { numFmt: column.numFmt } : {}),
      });
    });
  }

  if (waybills.length) {
    worksheet['!autofilter'] = {
      ref: utils.encode_range({
        s: { r: 3, c: 0 },
        e: { r: dataEndRow, c: columnCount - 1 },
      }),
    };
  }
  worksheet['!margins'] = {
    left: 0.3,
    right: 0.3,
    top: 0.5,
    bottom: 0.5,
    header: 0.2,
    footer: 0.2,
  };
  return worksheet;
}

export function buildInventoryExcelWorkbook(
  waybills: WaybillInventoryItem[],
  visibleColumnIds: InventoryColumnId[],
  showPricing: boolean,
  filterSummary: string,
  variant: InventoryExcelVariant = 'split-pending',
): WorkBook | null {
  const printColumnIds = resolvePrintColumnIds(visibleColumnIds);
  if (!waybills.length || !printColumnIds.length) return null;

  const rows = buildInventoryExcelRows(
    waybills,
    visibleColumnIds,
    showPricing,
    filterSummary,
    variant,
  );
  const worksheet = utils.aoa_to_sheet(rows);
  const columnCount = printColumnIds.length;
  const dataCount = waybills.length;
  const headerRows = variant === 'all-orders' ? 2 : 1;
  const totalRow = 3 + headerRows + dataCount;
  const summaryRow = totalRow + 1;
  const allOrderHeaders = variant === 'all-orders' ? allOrdersHeaderRows(printColumnIds) : null;

  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: columnCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: columnCount - 1 } },
    { s: { r: summaryRow, c: 0 }, e: { r: summaryRow, c: columnCount - 1 } },
    ...(allOrderHeaders?.merges ?? []),
  ];
  styleInventoryWorksheet(worksheet, rows, printColumnIds, dataCount, variant);

  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, variant === 'all-orders' ? 'Danh sach don' : 'Danh sach ton');
  if (variant === 'all-orders') {
    utils.book_append_sheet(
      workbook,
      buildDetailWorksheet(waybills, filterSummary),
      'Chi tiet don hang',
    );
  }
  return workbook;
}

export function downloadInventoryExcel(
  waybills: WaybillInventoryItem[],
  visibleColumnIds: InventoryColumnId[],
  showPricing: boolean,
  filterSummary: string,
  fileBaseName: string,
  variant: InventoryExcelVariant = 'split-pending',
) {
  const workbook = buildInventoryExcelWorkbook(
    waybills,
    visibleColumnIds,
    showPricing,
    filterSummary,
    variant,
  );
  if (!workbook) return false;

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  writeFile(workbook, `${fileBaseName}-${stamp}.xlsx`, { compression: true });
  return true;
}
