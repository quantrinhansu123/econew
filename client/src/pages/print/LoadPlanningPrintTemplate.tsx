import { Fragment, type ReactNode } from 'react';
import type { DispatchPrintRow } from './dispatchPrintFormat';
import { formatDispatchMoney, formatDispatchQuantity } from './dispatchPrintFormat';
import type { DispatchPrintColumnId } from './dispatchPrintColumns';
import {
  DISPATCH_PRINT_COLUMN_DEFS,
  getDispatchColumnDef,
  resolveVisibleDispatchColumnIds,
} from './dispatchPrintColumns';
import type { LoadPlanningPrintPayload } from './loadPlanningPrintUtils';

interface Props {
  data: LoadPlanningPrintPayload;
}

function renderHeader(header: string) {
  return header.split('\n').map((line, lineIndex) => (
    <span key={lineIndex}>
      {lineIndex > 0 ? <br /> : null}
      {line}
    </span>
  ));
}

function renderDispatchCell(id: DispatchPrintColumnId, row: DispatchPrintRow): ReactNode {
  const def = getDispatchColumnDef(id);
  const alignClass =
    def.align === 'center' ? 'col-center' : def.align === 'right' ? 'col-right' : undefined;

  switch (id) {
    case 'viTriHang':
      return <td className={`${def.cssClass} col-center`}>{row.viTriHang}</td>;
    case 'ngayBoc':
      return <td className={`${def.cssClass} col-center`}>{row.ngayBoc}</td>;
    case 'maTinh':
      return <td className={`${def.cssClass} col-center`}>{row.maTinh}</td>;
    case 'quanHuyen':
      return <td className={def.cssClass}>{row.quanHuyen}</td>;
    case 'phuongXa':
      return <td className={def.cssClass}>{row.phuongXa}</td>;
    case 'tenCtv':
      return (
        <td className={def.cssClass}>
          <span className="dispatch-cell-inner">{row.tenCtv}</span>
        </td>
      );
    case 'dv':
      return <td className={`${def.cssClass} col-center`}>{row.dv}</td>;
    case 'matHang':
      return (
        <td className={def.cssClass}>
          {row.matHang ? <div>{row.matHang}</div> : null}
          {row.matHangNote ? <div className="item-note">{row.matHangNote}</div> : null}
        </td>
      );
    case 'noiTra':
      return (
        <td className={def.cssClass}>
          <span className="dispatch-cell-inner">{row.noiTra}</span>
        </td>
      );
    case 'soLuong': {
      const qty = formatDispatchQuantity(row.soLuong, row.donVi);
      return (
        <td className={`${def.cssClass} col-center`}>
          {qty ? (
            <>
              <span className="qty-highlight">{qty.qty}</span>
              {qty.unit ? ` ${qty.unit}` : ''}
            </>
          ) : null}
        </td>
      );
    }
    case 'diaChiNhan':
      return (
        <td className={def.cssClass}>
          {row.nguoiNhanPhone ? <div className="phone">{row.nguoiNhanPhone}</div> : null}
          {row.diaChiNhan ? <div className="dispatch-cell-inner">{row.diaChiNhan}</div> : null}
        </td>
      );
    case 'tinhTrangGiaoHang':
      return <td className={`${def.cssClass} col-center`}>{row.tinhTrangGiaoHang}</td>;
    case 'ngayHoanThanh':
      return <td className={`${def.cssClass} col-center`}>{row.ngayHoanThanh}</td>;
    case 'keHoach':
      return <td className={def.cssClass}>{row.keHoach}</td>;
    case 'tangHaThuKhach':
      return <td className={`${def.cssClass} col-right`}>{row.tangHaThuKhach}</td>;
    case 'cuoc':
      return <td className={`${def.cssClass} col-right`}>{row.cuoc}</td>;
    case 'laiXeThuHo':
      return <td className={def.cssClass}>{row.laiXeThuHo}</td>;
    case 'bcThuHo':
      return <td className={def.cssClass}>{row.bcThuHo}</td>;
    case 'maBill':
      return (
        <td className={`${def.cssClass} col-center`}>
          <span className="dispatch-cell-inner">{row.maBill}</span>
        </td>
      );
    case 'ghiChu':
      return (
        <td className={def.cssClass}>
          <span className="dispatch-cell-inner">{row.ghiChu}</span>
        </td>
      );
    case 'ghiChu1':
      return (
        <td className={def.cssClass}>
          <span className="dispatch-cell-inner">{row.ghiChu1}</span>
        </td>
      );
    case 'ghiChu2':
      return (
        <td className={def.cssClass}>
          <span className="dispatch-cell-inner">{row.ghiChu2}</span>
        </td>
      );
    case 'kg':
      return <td className={`${def.cssClass} col-right`}>{row.kg}</td>;
    case 'm3':
      return <td className={`${def.cssClass} col-right`}>{row.m3}</td>;
    case 'duKienToiHcm':
      return <td className={`${def.cssClass} col-center`}>{row.duKienToiHcm}</td>;
    case 'qd':
      return <td className={`${def.cssClass} col-center`}>{row.qd}</td>;
    default:
      return <td className={alignClass}>{null}</td>;
  }
}

function renderFooterCells(
  visibleColumnIds: DispatchPrintColumnId[],
  totals: LoadPlanningPrintPayload['groups'][number]['totals'],
  showPricing: boolean,
) {
  const totalIds = new Set(
    DISPATCH_PRINT_COLUMN_DEFS.filter((col) => col.totalKey).map((col) => col.id),
  );
  const firstTotalIndex = visibleColumnIds.findIndex((id) => totalIds.has(id));
  const cells: ReactNode[] = [];

  visibleColumnIds.forEach((id, index) => {
    if (index === 0 && firstTotalIndex > 0) {
      cells.push(
        <td key="total-label" colSpan={firstTotalIndex} className="col-right font-bold">
          Tổng
        </td>,
      );
      return;
    }
    if (index > 0 && index < firstTotalIndex) return;

    const def = getDispatchColumnDef(id);

    if (id === 'soLuong') {
      cells.push(
        <td key={id} className={`${def.cssClass} col-center font-bold`}>
          {totals.soLuong}
        </td>,
      );
      return;
    }
    if (id === 'tangHaThuKhach') {
      cells.push(
        <td key={id} className={`${def.cssClass} col-right font-bold`}>
          {totals.tangHaThuKhach ? formatDispatchMoney(totals.tangHaThuKhach) : ''}
        </td>,
      );
      return;
    }
    if (id === 'cuoc') {
      cells.push(
        <td key={id} className={`${def.cssClass} col-right font-bold`}>
          {showPricing && totals.cuoc ? formatDispatchMoney(totals.cuoc) : ''}
        </td>,
      );
      return;
    }
    if (id === 'kg') {
      cells.push(
        <td key={id} className={`${def.cssClass} col-right font-bold`}>
          {totals.kg ? totals.kg.toLocaleString('vi-VN') : ''}
        </td>,
      );
      return;
    }
    if (id === 'm3') {
      cells.push(
        <td key={id} className={`${def.cssClass} col-right font-bold`}>
          {totals.m3 ? totals.m3.toLocaleString('vi-VN') : ''}
        </td>,
      );
      return;
    }

    if (firstTotalIndex < 0 && index === 0) {
      cells.push(
        <td key="total-label" className="col-right font-bold">
          Tổng
        </td>,
      );
      return;
    }

    if (firstTotalIndex >= 0 && index >= firstTotalIndex) {
      cells.push(<td key={id} className={def.cssClass} />);
    }
  });

  return cells;
}

export default function LoadPlanningPrintTemplate({ data }: Props) {
  const visibleColumnIds = resolveVisibleDispatchColumnIds(
    data.visibleColumnIds ?? DISPATCH_PRINT_COLUMN_DEFS.map((col) => col.id),
    data.showPricing,
  );

  return (
    <div className="inventory-stock-sheet">
      {data.groups.map((group, groupIndex) => (
        <section
          key={`${group.truckLabel}-${group.manifestCode}-${groupIndex}`}
          className="dispatch-print-group"
        >
          <h1 className="inventory-stock-title">{data.title}</h1>

          <div className="dispatch-print-info">
            <span>
              <strong>HUB đi:</strong> {group.originHubLabel || '—'}
            </span>
            <span>
              <strong>HUB đến:</strong> {group.destHubLabel || '—'}
            </span>
            <span>
              <strong>Biển số xe:</strong> {group.licensePlate || '—'}
            </span>
            <span>
              <strong>NCC:</strong> {group.nhaXe || '—'}
            </span>
            {group.manifestCode ? (
              <span>
                <strong>Bảng kê:</strong> {group.manifestCode}
              </span>
            ) : null}
          </div>

          <table className="inventory-stock-table inventory-stock-table--dispatch">
            <colgroup>
              {visibleColumnIds.map((id) => {
                const def = getDispatchColumnDef(id);
                return <col key={id} className={def.cssClass} />;
              })}
            </colgroup>
            <thead>
              <tr>
                {visibleColumnIds.map((id) => {
                  const def = getDispatchColumnDef(id);
                  return (
                    <th key={id} className={def.cssClass}>
                      {renderHeader(def.header)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row, idx) => (
                <tr key={`${row.maBill || 'row'}-${idx}`}>
                  {visibleColumnIds.map((id) => (
                    <Fragment key={id}>{renderDispatchCell(id, row)}</Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
            {group.totals.soLuong > 0 ? (
              <tfoot>
                <tr className="inventory-total-row">{renderFooterCells(visibleColumnIds, group.totals, data.showPricing)}</tr>
              </tfoot>
            ) : null}
          </table>

          {(group.driverName || group.driverPhone || group.expectedArrival) ? (
            <div className="dispatch-print-trip-footer">
              {group.driverName ? <span><strong>Xe:</strong> {group.driverName}</span> : null}
              {group.licensePlate ? <span><strong>BKS:</strong> {group.licensePlate}</span> : null}
              {group.driverPhone ? <span><strong>SĐT:</strong> {group.driverPhone}</span> : null}
              {group.expectedArrival ? (
                <span className="dispatch-print-eta">
                  dự kiến {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(group.expectedArrival))} tới
                </span>
              ) : null}
            </div>
          ) : null}

          {groupIndex < data.groups.length - 1 ? <div className="dispatch-print-page-break" /> : null}
        </section>
      ))}

      <p className="inventory-stock-meta">
        In lúc: {data.printedAt}
        {data.filterSummary ? ` · ${data.filterSummary}` : ''}
      </p>
    </div>
  );
}
