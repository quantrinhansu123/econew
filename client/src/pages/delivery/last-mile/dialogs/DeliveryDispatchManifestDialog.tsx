import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import DispatchPrintColumnDropdown from '../../../print/DispatchPrintColumnDropdown';
import type { DispatchPrintColumnId } from '../../../print/dispatchPrintColumns';
import { loadVisibleDispatchColumnIds, saveVisibleDispatchColumnIds } from '../../../print/dispatchPrintColumns';
import '../../../print/inventory-stock-list.css';
import ManifestDispatchPrintView from '../../../warehouse/manifests/ManifestDispatchPrintView';
import { buildManifestPrintRows } from '../../../warehouse/manifests/manifestDispatchPrintUtils';
import type { DispatchLink } from '../../../warehouse/manifests/manifestDispatchDefaults';
import type { LoadPlanningManifest } from '../../../warehouse/manifests/types';
import type { LastMileWaybill } from '../types';

interface DispatchGroup {
  key: string;
  manifest: LoadPlanningManifest;
  links: DispatchLink[];
}

const status = (waybill: LastMileWaybill) => String(waybill.current_state || '').toUpperCase();

function buildGroups(waybills: LastMileWaybill[]): DispatchGroup[] {
  const grouped = new Map<string, LastMileWaybill[]>();
  waybills.filter((waybill) => status(waybill) === 'OUT_FOR_DELIVERY' && waybill.delivery_assignment_type).forEach((waybill) => {
    const assignee = waybill.delivery_assignment_type === 'PARTNER'
      ? `vendor:${waybill.last_mile_vendor_id || waybill.last_mile_vendor?.id || 'unknown'}`
      : `truck:${waybill.last_mile_truck_id || waybill.last_mile_driver_id || 'unknown'}`;
    const key = `${waybill.route_code || 'CHUA-TUYEN'}|${assignee}`;
    grouped.set(key, [...(grouped.get(key) || []), waybill]);
  });

  return [...grouped.entries()].map(([key, items], groupIndex) => {
    const first = items[0];
    const routeCode = first.route_code || 'CHUA-TUYEN';
    const plate = first.last_mile_truck?.bks || first.last_mile_truck?.license_plate || '';
    const driverName = first.last_mile_driver?.name || first.last_mile_driver?.username || '';
    const vendorName = first.last_mile_vendor?.name || first.last_mile_vendor?.code || '';
    const manifestCode = `BKPHAT-${String(first.dest_hub?.code || first.dest_hub_id || 'HUB').toUpperCase()}-${routeCode}-${String(groupIndex + 1).padStart(2, '0')}`;
    const links: DispatchLink[] = items.map((waybill, index) => ({
      waybill_id: waybill.task_id || `${waybill.id}-${index}`,
      loading_position: index + 1,
      loaded_at: waybill.sent_date || waybill.created_at || null,
      waybill: {
        id: waybill.id,
        waybill_code: waybill.waybill_code,
        sender_info: waybill.sender_info,
        receiver_info: waybill.receiver_info,
        receiver_phone: waybill.receiver_phone,
        receiver_address: waybill.receiver_address,
        noi_dung: (waybill as { noi_dung?: string | null }).noi_dung,
        note: waybill.note,
        cod_amount: waybill.cod_amount,
        cost_amount: waybill.cost_amount,
        package_count: waybill.trip_package_count ?? waybill.package_count,
        weight: waybill.weight,
        the_tich_m3: waybill.the_tich_m3,
        volumetric_weight: waybill.volumetric_weight,
        dest_hub: waybill.dest_hub,
        dest_hub_id: waybill.dest_hub_id,
      },
    }));
    const manifest = {
      id: key,
      manifest_code: manifestCode,
      origin_hub_id: first.dest_hub_id,
      origin_hub: first.dest_hub,
      dest_hub_id: key,
      dest_hub: { code: routeCode, name: 'Tuyến giao chặng cuối' },
      created_at: new Date().toISOString(),
      trip: {
        id: key,
        departure_time: new Date().toISOString(),
        carrier_label: first.delivery_assignment_type === 'PARTNER' ? vendorName : driverName,
        driver_name: first.delivery_assignment_type === 'PARTNER' ? vendorName : driverName,
        driver_phone: first.delivery_assignment_type === 'PARTNER' ? first.last_mile_vendor?.phone : first.last_mile_driver?.phone,
        truck: { bks: plate, license_plate: plate, ten_lai_xe: driverName },
      },
    } as unknown as LoadPlanningManifest;
    return { key, manifest, links };
  });
}

const PRINT_STYLE = `@media print {
  body > *:not(.delivery-dispatch-print-root) { display: none !important; }
  .delivery-dispatch-print-root, .delivery-dispatch-print-panel, .delivery-dispatch-print-body { position: static !important; display: block !important; width: 100% !important; max-width: none !important; height: auto !important; overflow: visible !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; background: white !important; }
  .delivery-dispatch-print-toolbar { display: none !important; }
  .delivery-dispatch-print-group { break-after: page; page-break-after: always; }
  .delivery-dispatch-print-group:last-child { break-after: auto; page-break-after: auto; }
}`;

export default function DeliveryDispatchManifestDialog({ open, waybills, showPricing, onClose }: { open: boolean; waybills: LastMileWaybill[]; showPricing: boolean; onClose: () => void }) {
  const [columns, setColumns] = useState<DispatchPrintColumnId[]>(() => loadVisibleDispatchColumnIds(showPricing));
  const groups = useMemo(() => buildGroups(waybills), [waybills]);
  if (!open) return null;
  const updateColumns = (next: DispatchPrintColumnId[]) => { saveVisibleDispatchColumnIds(next); setColumns(next); };
  return createPortal(<div className="delivery-dispatch-print-root fixed inset-0 z-[9999] flex justify-end">
    <style>{PRINT_STYLE}</style><div className="fixed inset-0 bg-black/40 backdrop-blur-sm print:hidden" onClick={onClose}/>
    <div className="delivery-dispatch-print-panel relative flex h-screen w-full max-w-[min(1380px,98vw)] flex-col border-l bg-[#e8eef5] shadow-2xl">
      <div className="delivery-dispatch-print-toolbar flex items-center justify-between border-b bg-white px-5 py-4 print:hidden"><div><p className="text-[11px] font-bold uppercase tracking-wider text-primary">Bảng kê đi phát theo xe/NCC</p><h2 className="text-lg font-extrabold">{groups.length} bảng kê · {groups.reduce((sum, group) => sum + group.links.length, 0)} dòng hàng</h2></div><div className="flex gap-2"><DispatchPrintColumnDropdown value={columns} canViewPricing={showPricing} onChange={updateColumns}/><button disabled={!groups.length} onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-bold text-white disabled:opacity-50"><Printer size={16}/>In tất cả</button><button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-white"><X size={18}/></button></div></div>
      <div className="delivery-dispatch-print-body min-h-0 flex-1 overflow-auto p-4 custom-scrollbar">{!groups.length ? <div className="flex min-h-80 items-center justify-center text-sm font-bold text-muted-foreground">Chưa có đơn đã phân tuyến và phân xe để in.</div> : groups.map((group) => <div key={group.key} className="delivery-dispatch-print-group"><ManifestDispatchPrintView manifest={group.manifest} links={group.links} rows={buildManifestPrintRows(group.links)} visibleColumnIds={columns}/></div>)}</div>
    </div>
  </div>, document.body);
}
