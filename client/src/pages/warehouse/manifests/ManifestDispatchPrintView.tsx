import ManifestDispatchSheetTable from './ManifestDispatchSheetTable';
import type { DispatchPrintColumnId } from '../../print/dispatchPrintColumns';
import type { DispatchLink } from './manifestDispatchDefaults';
import { manifestPrintCode, manifestPrintTrip } from './manifestDispatchPrintUtils';
import type { LoadPlanningManifest, ManifestDispatchFields } from './types';

interface Props {
  manifest: LoadPlanningManifest;
  links: DispatchLink[];
  rows: Record<string, ManifestDispatchFields>;
  visibleColumnIds: DispatchPrintColumnId[];
}

export default function ManifestDispatchPrintView({ manifest, links, rows, visibleColumnIds }: Props) {
  const trip = manifestPrintTrip(manifest);
  const licensePlate = trip?.truck?.bks?.trim() || trip?.truck?.license_plate?.trim() || trip?.carrier_label?.trim() || '—';
  const carrier = trip?.carrier_label?.trim() || trip?.driver_name || trip?.truck?.ten_lai_xe || '—';
  const manifestCode = manifestPrintCode(manifest);
  const printedAt = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());

  return (
    <div className="inventory-stock-sheet manifest-dispatch-sheet">
      <header className="manifest-dispatch-print-header">
        <h1 className="manifest-dispatch-print-title">BẢNG KÊ PHÁT HÀNG ECO</h1>
        <div className="manifest-dispatch-print-meta-grid" aria-label="Thông tin bảng kê">
          <div className="manifest-dispatch-print-meta-item">
            <span className="manifest-dispatch-print-meta-label">Biển số xe</span>
            <span className="manifest-dispatch-print-meta-value">{licensePlate}</span>
          </div>
          <div className="manifest-dispatch-print-meta-item">
            <span className="manifest-dispatch-print-meta-label">NCC / Tài xế</span>
            <span className="manifest-dispatch-print-meta-value">{carrier}</span>
          </div>
          <div className="manifest-dispatch-print-meta-item">
            <span className="manifest-dispatch-print-meta-label">Mã bảng kê</span>
            <span className="manifest-dispatch-print-meta-value">{manifestCode}</span>
          </div>
          <div className="manifest-dispatch-print-meta-item">
            <span className="manifest-dispatch-print-meta-label">Số dòng hàng</span>
            <span className="manifest-dispatch-print-meta-value">{links.length.toLocaleString('vi-VN')}</span>
          </div>
        </div>
      </header>

      <div className="manifest-dispatch-sheet-scroll">
        <ManifestDispatchSheetTable
          manifest={manifest}
          links={links}
          rows={rows}
          visibleColumnIds={visibleColumnIds}
          readOnly
        />
      </div>

      <p className="manifest-dispatch-print-footer">
        In lúc: {printedAt} · {manifestCode}
      </p>
    </div>
  );
}
