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
  destinationHub?: { id?: string | number | null; code?: string | null; name?: string | null; phone?: string | null; manager_phone?: string | null } | null;
  destinationHubId?: string | number | null;
}

const hubLabel = (
  hub: { id?: string | number | null; code?: string | null; name?: string | null } | null | undefined,
  id?: string | number | null,
) => {
  const code = String(hub?.code || '').trim();
  const name = String(hub?.name || '').trim();
  if (code && name && code.toLocaleLowerCase('vi') !== name.toLocaleLowerCase('vi')) {
    return `${code} · ${name}`;
  }
  return code || name || (id ? `#${id}` : '—');
};

export default function ManifestDispatchPrintView({ manifest, links, rows, visibleColumnIds, destinationHub: destinationHubOverride, destinationHubId }: Props) {
  const trip = manifestPrintTrip(manifest);
  const licensePlate = trip?.truck?.bks?.trim() || trip?.truck?.license_plate?.trim() || trip?.carrier_label?.trim() || '—';
  const carrier = trip?.carrier_label?.trim() || trip?.driver_name || trip?.truck?.ten_lai_xe || '—';
  const manifestCode = manifestPrintCode(manifest);
  const originHub = hubLabel(manifest.origin_hub, manifest.origin_hub_id);
  const destinationHub = hubLabel(destinationHubOverride ?? manifest.dest_hub, destinationHubId ?? manifest.dest_hub_id);
  const originHubPhone = manifest.origin_hub?.phone || manifest.origin_hub?.manager_phone || '—';
  const destinationHubRecord = destinationHubOverride ?? manifest.dest_hub;
  const destinationHubPhone = destinationHubRecord?.phone || destinationHubRecord?.manager_phone || '—';
  const driverPhone = trip?.driver_phone || trip?.driver?.phone || trip?.truck?.driver?.phone || trip?.truck?.phone || '—';
  const departureDate = trip?.departure_time
    ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(trip.departure_time))
    : '—';
  const printedAt = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
  const hubExpectedArrival = links.find((link) => link.dispatch_fields?.expected_arrival_at)?.dispatch_fields?.expected_arrival_at;
  const hubExpectedArrivalLabel = hubExpectedArrival
    ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(String(hubExpectedArrival)))
    : '—';

  return (
    <div className="inventory-stock-sheet manifest-dispatch-sheet">
      <header className="manifest-dispatch-print-header">
        <h1 className="manifest-dispatch-print-title">BẢNG KÊ PHÁT HÀNG ECO</h1>
        <div className="manifest-dispatch-print-meta-grid" aria-label="Thông tin bảng kê">
          <div className="manifest-dispatch-print-meta-item">
            <span className="manifest-dispatch-print-meta-label">HUB đi</span>
            <span className="manifest-dispatch-print-meta-value">{originHub}</span>
            <span className="manifest-dispatch-print-meta-detail">SĐT: {originHubPhone}</span>
          </div>
          <div className="manifest-dispatch-print-meta-item">
            <span className="manifest-dispatch-print-meta-label">HUB đến</span>
            <span className="manifest-dispatch-print-meta-value">{destinationHub}</span>
            <span className="manifest-dispatch-print-meta-detail">SĐT: {destinationHubPhone}</span>
            <span className="manifest-dispatch-print-meta-detail">Dự kiến đến: {hubExpectedArrivalLabel}</span>
          </div>
          <div className="manifest-dispatch-print-meta-item">
            <span className="manifest-dispatch-print-meta-label">Biển số xe</span>
            <span className="manifest-dispatch-print-meta-value">{licensePlate}</span>
          </div>
          <div className="manifest-dispatch-print-meta-item">
            <span className="manifest-dispatch-print-meta-label">NCC / Tài xế</span>
            <span className="manifest-dispatch-print-meta-value">{carrier}</span>
            <span className="manifest-dispatch-print-meta-detail">SĐT: {driverPhone}</span>
            <span className="manifest-dispatch-print-meta-detail">Khởi hành: {departureDate}</span>
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
