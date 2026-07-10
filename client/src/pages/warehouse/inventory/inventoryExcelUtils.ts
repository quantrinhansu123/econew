import { utils, writeFile } from 'xlsx';
import type { InventoryColumnId } from './inventoryColumns';
import {
  INVENTORY_COLUMNS,
  computeGrandTotals,
  getInventoryPrintColumnWidth,
  resolvePrintColumnIds,
} from './inventoryColumns';
import type { WaybillInventoryItem } from './types';
import { inventoryPrintCellValue } from '../../print/inventoryPrintUtils';

export function buildInventoryExcelRows(
  waybills: WaybillInventoryItem[],
  visibleColumnIds: InventoryColumnId[],
  showPricing: boolean,
  filterSummary: string,
): string[][] {
  const printColumnIds = resolvePrintColumnIds(visibleColumnIds);
  const headers = printColumnIds.map((id) => INVENTORY_COLUMNS.find((col) => col.id === id)?.label ?? id);
  const dataRows = waybills.map((waybill, index) =>
    printColumnIds.map((colId) => inventoryPrintCellValue(waybill, colId, showPricing, index + 1)),
  );

  const totals = computeGrandTotals(waybills, false);
  const totalLabelCol =
    printColumnIds.find((id) => id === 'order_code')
    ?? printColumnIds.find((id) => id === 'waybill_code')
    ?? printColumnIds[0];
  const totalRow = printColumnIds.map((id) => {
    if (id === totalLabelCol) return 'Tổng cộng';
    if (id === 'package_count') return String(totals.package_count);
    if (id === 'weight') return totals.weight_kg.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
    if (id === 'volume') return totals.volume_m3.toFixed(2);
    return '';
  });

  const printedAt = new Date().toLocaleString('vi-VN');
  const meta = filterSummary ? `In lúc: ${printedAt} · ${filterSummary}` : `In lúc: ${printedAt}`;

  return [
    ['DANH SÁCH TỒN KHO ECO'],
    [meta],
    [],
    headers,
    ...dataRows,
    [],
    totalRow,
    [],
    [`Tổng kiện: ${totals.package_count} · Tổng cân: ${totals.weight_kg.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg · Tổng khối: ${totals.volume_m3.toFixed(2)} m³`],
  ];
}

export function downloadInventoryExcel(
  waybills: WaybillInventoryItem[],
  visibleColumnIds: InventoryColumnId[],
  showPricing: boolean,
  filterSummary: string,
  fileBaseName: string,
) {
  const printColumnIds = resolvePrintColumnIds(visibleColumnIds);
  if (!waybills.length || !printColumnIds.length) return false;

  const rows = buildInventoryExcelRows(waybills, visibleColumnIds, showPricing, filterSummary);
  const worksheet = utils.aoa_to_sheet(rows);
  const colCount = printColumnIds.length;

  worksheet['!cols'] = printColumnIds.map((id) => ({
    wch: Math.max(6, Math.round(getInventoryPrintColumnWidth(id, colCount) * 0.22)),
  }));

  if (colCount > 1) {
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
      { s: { r: rows.length - 1, c: 0 }, e: { r: rows.length - 1, c: colCount - 1 } },
    ];
  }

  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, 'Danh sach ton');

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  writeFile(workbook, `${fileBaseName}-${stamp}.xlsx`);
  return true;
}
