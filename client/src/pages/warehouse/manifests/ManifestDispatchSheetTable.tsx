import { useMemo } from 'react';
import { PackageCheck } from 'lucide-react';
import {
  getDispatchColumnDef,
  type DispatchPrintColumnId,
} from '../../print/dispatchPrintColumns';
import {
  computeDispatchTotals,
  formatReceiverAddressWithPhone,
  getDispatchCellValue,
  type DispatchFieldKey,
  type DispatchLink,
} from './manifestDispatchDefaults';
import { dispatchSheetHeaderClass, DISPATCH_SHEET_PRINT_WIDTHS, getDispatchSheetColumnMeta } from './manifestDispatchSheetColumns';
import type { LoadPlanningManifest, ManifestDispatchFields } from './types';

type EditableRows = Record<string, ManifestDispatchFields>;

const formatShortDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const formatExpectedArrival = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const time = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  const dayMonth = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date);
  return `dự kiến ${time} ngày ${dayMonth} tới`;
};

const manifestTrip = (manifest: LoadPlanningManifest) => manifest.trip ?? manifest.trips?.[0] ?? null;
const resolveTruckPlate = (trip?: LoadPlanningManifest['trip']) =>
  trip?.truck?.bks?.trim() || trip?.truck?.license_plate?.trim() || trip?.carrier_label?.trim() || null;
const truckLabel = (manifest: LoadPlanningManifest) => resolveTruckPlate(manifestTrip(manifest)) || 'Chưa có xe';
const driverLabel = (manifest: LoadPlanningManifest) =>
  manifestTrip(manifest)?.driver_name
  || manifestTrip(manifest)?.driver?.name
  || manifestTrip(manifest)?.driver?.full_name
  || manifestTrip(manifest)?.truck?.ten_lai_xe
  || manifestTrip(manifest)?.truck?.driver?.name
  || 'Chưa gán tài xế';
const driverPhoneLabel = (manifest: LoadPlanningManifest) =>
  manifestTrip(manifest)?.driver_phone
  || manifestTrip(manifest)?.driver?.phone
  || manifestTrip(manifest)?.truck?.driver?.phone
  || 'Chưa có SĐT';
const expectedArrival = (manifest: LoadPlanningManifest) =>
  manifestTrip(manifest)?.expected_arrival_time || manifestTrip(manifest)?.arrival_time || null;

export function rowKey(link: DispatchLink) {
  return String(link.waybill_id ?? link.waybill?.id ?? '');
}

function renderAddressCell(value: string) {
  const phoneMatch = value.match(/SĐT:\s*([^·]+)/i);
  if (!phoneMatch) return <span className="px-1.5 py-2 text-left text-[12px] font-semibold">{value}</span>;
  const phone = phoneMatch[1].trim();
  const address = value.replace(/·?\s*SĐT:\s*[^·]+/i, '').trim();
  return (
    <div className="px-1.5 py-2 text-left text-[12px] font-semibold leading-snug">
      {phone ? <div className="font-black text-red-600">SĐT: {phone}</div> : null}
      {address ? <div>{address}</div> : null}
    </div>
  );
}

function renderQuantityCell(
  rows: EditableRows,
  link: DispatchLink,
  waybillId: string,
  onCellChange: (waybillId: string, key: DispatchFieldKey, value: string) => void,
) {
  const qty = getDispatchCellValue(rows, link, waybillId, 'so_luong');
  const unit = getDispatchCellValue(rows, link, waybillId, 'loai') || 'kiện';
  return (
    <div className="min-h-[50px] px-1 py-2">
      <input
        value={qty}
        onChange={(event) => onCellChange(waybillId, 'so_luong', event.target.value)}
        className="w-full border-0 bg-transparent text-center text-[12px] font-black text-red-600 outline-none focus:bg-white focus:ring-2 focus:ring-primary/30"
      />
      <input
        value={unit}
        onChange={(event) => onCellChange(waybillId, 'loai', event.target.value)}
        className="mt-1 w-full border-0 bg-transparent text-center text-[11px] font-semibold text-muted-foreground outline-none focus:bg-white focus:ring-2 focus:ring-primary/30"
        placeholder="kiện"
      />
    </div>
  );
}

interface Props {
  manifest: LoadPlanningManifest;
  links: DispatchLink[];
  rows: EditableRows;
  visibleColumnIds: DispatchPrintColumnId[];
  readOnly?: boolean;
  onCellChange?: (waybillId: string, key: DispatchFieldKey, value: string) => void;
}

export default function ManifestDispatchSheetTable({
  manifest,
  links,
  rows,
  visibleColumnIds,
  readOnly = false,
  onCellChange,
}: Props) {
  const totals = useMemo(() => computeDispatchTotals(links, rows, rowKey), [links, rows]);
  const dataColumns = visibleColumnIds.filter((id) => id !== 'viTriHang');

  function renderHeaderLabel(columnId: DispatchPrintColumnId) {
    const def = getDispatchColumnDef(columnId);
    return def.header.split('\n').map((line, index) => (
      <span key={`${columnId}-${index}`}>
        {index > 0 ? <br /> : null}
        {line}
      </span>
    ));
  }

  function renderDataCell(columnId: DispatchPrintColumnId, link: DispatchLink, waybillId: string) {
    const meta = getDispatchSheetColumnMeta(columnId);
    const fieldKey = meta.fieldKey;

    if (columnId === 'soLuong') {
      if (readOnly || !onCellChange) {
        const qty = getDispatchCellValue(rows, link, waybillId, 'so_luong');
        const unit = getDispatchCellValue(rows, link, waybillId, 'loai') || 'kiện';
        return (
          <div className="min-h-[50px] px-1 py-2 text-center text-[12px]">
            <div className="font-black text-slate-950">{qty}</div>
            <div className="text-[11px] font-semibold text-slate-600">{unit}</div>
          </div>
        );
      }
      return renderQuantityCell(rows, link, waybillId, onCellChange);
    }

    if (columnId === 'diaChiNhan') {
      const value = getDispatchCellValue(rows, link, waybillId, 'dia_chi') || formatReceiverAddressWithPhone(link);
      return renderAddressCell(value);
    }

    if (columnId === 'cuoc') {
      const saved = getDispatchCellValue(rows, link, waybillId, 'bc_thu_ho');
      const value = saved || String(link.waybill?.cost_amount ?? '');
      return (
        <div className="min-h-[50px] px-1.5 py-2 text-right text-[12px] font-black text-red-600">
          {value ? Number(value).toLocaleString('vi-VN') : ''}
        </div>
      );
    }

    if (!fieldKey) return null;

    const value = getDispatchCellValue(rows, link, waybillId, fieldKey);
    const isRedText = columnId === 'noiTra' || columnId === 'tangHaThuKhach' || columnId === 'ghiChu' || columnId === 'tinhTrangGiaoHang';
    const alignClass = meta.money || columnId === 'kg' || columnId === 'm3' ? 'text-right' : 'text-center';

    if (readOnly || meta.readOnly || !onCellChange) {
      return (
        <div className={`min-h-[50px] px-1.5 py-2 text-[12px] font-semibold ${alignClass} ${isRedText || meta.money ? 'font-black text-red-600' : ''}`}>
          {value}
        </div>
      );
    }

    return (
      <textarea
        value={value}
        onChange={(event) => onCellChange(waybillId, fieldKey, event.target.value)}
        className={`min-h-[50px] w-full resize-y border-0 bg-transparent px-1.5 py-2 text-[12px] font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-primary/30 ${alignClass} ${isRedText || meta.money ? 'font-black text-red-600' : ''}`}
      />
    );
  }

  if (!links.length) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 text-muted-foreground">
        <PackageCheck size={22} />
        <p className="text-[13px] font-bold">Bảng kê chưa có dòng hàng.</p>
      </div>
    );
  }

  return (
    <table className="manifest-dispatch-sheet-table w-full border-collapse text-center text-[12px] text-slate-950">
      <colgroup>
        <col className="dispatch-col-location" style={{ width: '4%' }} />
        {dataColumns.map((columnId) => (
          <col key={columnId} style={{ width: DISPATCH_SHEET_PRINT_WIDTHS[columnId] || '5%' }} />
        ))}
      </colgroup>
      <thead>
        <tr className="bg-[#c6efce] text-[11px] font-black">
          <th className="dispatch-col-location border border-black bg-yellow-300 px-1 py-2">
            Vị trí
            <br />
            hàng
          </th>
          {dataColumns.map((columnId) => {
            const columnMeta = getDispatchSheetColumnMeta(columnId);
            return (
              <th
                key={columnId}
                className={`border border-black px-1 py-2 ${columnMeta.cellClass || ''} ${dispatchSheetHeaderClass(columnId)}`}
              >
                {renderHeaderLabel(columnId)}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {links.map((link, index) => {
          const waybillId = rowKey(link);
          return (
            <tr key={waybillId || index} className="align-middle odd:bg-white even:bg-slate-100">
              <td className="dispatch-col-location border border-black bg-yellow-300 px-1 py-2 font-black text-blue-900">
                {link.loading_position ?? index + 1}
              </td>
              {dataColumns.map((columnId) => {
                const columnMeta = getDispatchSheetColumnMeta(columnId);
                return (
                  <td key={columnId} className={`border border-black p-0 ${columnMeta.cellClass || ''} ${dispatchSheetHeaderClass(columnId)}`}>
                    {renderDataCell(columnId, link, waybillId)}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="bg-slate-100 font-black">
          <td className="dispatch-col-location border border-black bg-yellow-300 px-2 py-2 text-right">TỔNG</td>
          {dataColumns.map((columnId) => {
            if (columnId === 'soLuong') {
              return (
                <td key={columnId} className="border border-black px-2 py-2 text-center">
                  {totals.soLuong} {totals.unitLabel}
                </td>
              );
            }
            if (columnId === 'tangHaThuKhach') {
              return (
                <td key={columnId} className="border border-black px-2 py-2 text-right text-red-600">
                  {totals.cod ? totals.cod.toLocaleString('vi-VN') : ''}
                </td>
              );
            }
            if (columnId === 'kg') {
              return (
                <td key={columnId} className="border border-black px-2 py-2 text-right">
                  {totals.kg ? totals.kg.toLocaleString('vi-VN') : ''}
                </td>
              );
            }
            if (columnId === 'm3') {
              return (
                <td key={columnId} className="border border-black px-2 py-2 text-right">
                  {totals.m3 ? totals.m3.toLocaleString('vi-VN') : ''}
                </td>
              );
            }
            return <td key={columnId} className="border border-black px-2 py-2" />;
          })}
        </tr>
        <tr>
          <td colSpan={dataColumns.length + 1} className="border border-black px-3 py-2 text-left text-[12px] font-bold manifest-dispatch-trip-footer">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <span><strong>Xe:</strong> {driverLabel(manifest)}</span>
              <span><strong>Ngày:</strong> {formatShortDate(manifest.closed_at || manifest.created_at)}</span>
              <span><strong>BKS:</strong> {truckLabel(manifest)}</span>
              <span><strong>SĐT:</strong> {driverPhoneLabel(manifest)}</span>
              {expectedArrival(manifest) ? (
                <span className="manifest-dispatch-eta rounded bg-yellow-300 px-3 py-1 font-black">
                  {formatExpectedArrival(expectedArrival(manifest))}
                </span>
              ) : null}
            </div>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
