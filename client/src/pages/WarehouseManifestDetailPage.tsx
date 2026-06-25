import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarClock, Edit3, Eye, Loader2, PackageCheck, Phone, Printer, RefreshCcw, Save, Search, Truck, UserRound, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/api';
import { DateTimePicker } from '../components/ui/DateTimePicker';
import DispatchPrintColumnDropdown from './print/DispatchPrintColumnDropdown';
import type { DispatchPrintColumnId } from './print/dispatchPrintColumns';
import {
  loadVisibleDispatchColumnIds,
  saveVisibleDispatchColumnIds,
} from './print/dispatchPrintColumns';
import {
  type DispatchFieldKey,
  type DispatchLink,
} from './warehouse/manifests/manifestDispatchDefaults';
import ManifestDispatchSheetTable, { rowKey } from './warehouse/manifests/ManifestDispatchSheetTable';
import type { LoadPlanningManifest, ManifestDispatchFields } from './warehouse/manifests/types';

const USER_PROFILE_KEY = 'eco_user_profile';
const MANAGER = 32;
const DIRECTOR = 64;

type RowLink = DispatchLink;
type EditableRows = Record<string, ManifestDispatchFields>;

function canViewPricing() {
  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
    if (!raw) return false;
    const roleMask = Number((JSON.parse(raw) as { role_mask?: number }).role_mask ?? 0);
    return (roleMask & (MANAGER | DIRECTOR)) !== 0;
  } catch {
    return false;
  }
}

const display = (value?: string | number | null, fallback = '—') => (value == null || value === '' ? fallback : String(value));
const manifestCode = (manifest?: LoadPlanningManifest | null) => manifest?.manifest_code || manifest?.code || (manifest ? `MF-${manifest.id}` : '—');
const hubLabel = (hub?: { code?: string | null; name?: string | null } | null, id?: string | number | null) => hub?.code || hub?.name || (id ? `Hub #${id}` : '—');
const manifestTrip = (manifest: LoadPlanningManifest) => manifest.trip ?? manifest.trips?.[0] ?? null;
const resolveTruckPlate = (trip?: LoadPlanningManifest['trip']) => trip?.truck?.bks?.trim() || trip?.truck?.license_plate?.trim() || trip?.carrier_label?.trim() || null;
const tripLabel = (manifest: LoadPlanningManifest) => {
  const trip = manifestTrip(manifest);
  if (trip?.trip_code || trip?.code) return trip.trip_code || trip.code || '—';
  const tripId = manifest.trip_id ?? trip?.id;
  if (tripId && !String(tripId).startsWith('split-')) return `Chuyến #${tripId}`;
  return resolveTruckPlate(trip) || 'Chưa gán chuyến';
};
const truckLabel = (manifest: LoadPlanningManifest) => resolveTruckPlate(manifestTrip(manifest)) || 'Chưa có xe';
const driverLabel = (manifest: LoadPlanningManifest) => manifestTrip(manifest)?.driver_name || manifestTrip(manifest)?.driver?.name || manifestTrip(manifest)?.driver?.full_name || manifestTrip(manifest)?.truck?.ten_lai_xe || manifestTrip(manifest)?.truck?.driver?.name || manifestTrip(manifest)?.truck?.driver?.full_name || 'Chưa gán tài xế';
const driverPhoneLabel = (manifest: LoadPlanningManifest) => manifestTrip(manifest)?.driver_phone || manifestTrip(manifest)?.driver?.phone || manifestTrip(manifest)?.truck?.driver?.phone || manifestTrip(manifest)?.truck?.phone || 'Chưa có SĐT';
const expectedArrival = (manifest: LoadPlanningManifest) => manifestTrip(manifest)?.expected_arrival_time || manifestTrip(manifest)?.arrival_time || null;
const formatNumber = (value?: string | number | null, suffix = '') => value == null || value === '' ? '—' : `${Number(value).toLocaleString('vi-VN')}${suffix}`;
const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};
const toDateTimeLocalValue = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

function normalizeLinks(manifest: LoadPlanningManifest | null): RowLink[] {
  if (!manifest) return [];
  if (manifest.manifest_waybills?.length) return manifest.manifest_waybills as RowLink[];
  return (manifest.waybills ?? []).map((waybill, index) => ({ waybill_id: waybill.id, loading_position: index + 1, dispatch_fields: waybill.dispatch_fields, waybill }));
}

function isArrived(manifest: LoadPlanningManifest) {
  return ['COMPLETED', 'ARRIVED', 'AT_DEST_HUB', 'Xe đã đến'].includes(String(manifest.trip?.status || manifest.status || ''));
}

export default function WarehouseManifestDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const showPricing = canViewPricing();
  const [manifest, setManifest] = useState<LoadPlanningManifest | null>(null);
  const [rows, setRows] = useState<EditableRows>({});
  const [keyword, setKeyword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [visibleColumnIds, setVisibleColumnIds] = useState<DispatchPrintColumnId[]>(() => loadVisibleDispatchColumnIds(showPricing));

  async function loadManifest() {
    setIsLoading(true);
    setError('');
    try {
      const response = await apiRequest<LoadPlanningManifest>(`/manifests/${id}`);
      setManifest(response);
      const initial: EditableRows = {};
      normalizeLinks(response).forEach((link) => {
        const key = rowKey(link);
        if (key) initial[key] = { ...(link.dispatch_fields ?? {}) };
      });
      setRows(initial);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được chi tiết bảng kê.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void loadManifest(); }, [id]);

  function openDispatchSheet(forPrint = false) {
    if (forPrint && manifest) {
      window.open(`/print/manifest/${manifest.id}`, '_blank', 'noopener');
      return;
    }
    setIsDialogOpen(true);
  }

  const links = useMemo(() => normalizeLinks(manifest).sort((a, b) => Number(a.loading_position ?? 9999) - Number(b.loading_position ?? 9999)), [manifest]);
  const filteredLinks = useMemo(() => {
    const search = keyword.trim().toLowerCase();
    if (!search) return links;
    return links.filter((link) => [link.waybill?.waybill_code, link.waybill?.sender_info, link.waybill?.receiver_info].some((value) => String(value || '').toLowerCase().includes(search)));
  }, [links, keyword]);

  function updateCell(waybillId: string, key: DispatchFieldKey, value: string) {
    setRows((prev) => ({ ...prev, [waybillId]: { ...(prev[waybillId] ?? {}), [key]: value } }));
  }

  function updateVisibleColumns(ids: DispatchPrintColumnId[]) {
    setVisibleColumnIds(ids);
    saveVisibleDispatchColumnIds(ids);
  }

  async function saveRows() {
    if (!manifest) return;
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = { rows: normalizeLinks(manifest).map((link) => ({ waybill_id: rowKey(link), fields: rows[rowKey(link)] ?? {} })) };
      const response = await apiRequest<LoadPlanningManifest>(`/manifests/${manifest.id}/dispatch-rows`, { method: 'PATCH', body: payload });
      setManifest(response);
      setMessage('Đã lưu thông tin bảng kê phát hàng.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không lưu được thông tin bảng kê.');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveExpectedArrival(manifestItem: LoadPlanningManifest, value: string) {
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(`/manifests/${manifestItem.id}/expected-arrival`, { method: 'PATCH', body: { expected_arrival_time: value ? new Date(value).toISOString() : null } });
      setMessage('Đã cập nhật ngày dự kiến đến.');
      await loadManifest();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không cập nhật được ngày dự kiến đến.');
    } finally {
      setIsSaving(false);
    }
  }

  const kanbanColumns = useMemo(() => {
    const departed = manifest && !isArrived(manifest) ? [manifest] : [];
    const expected = manifest && isArrived(manifest) ? [manifest] : [];
    return [
      { key: 'departed', title: 'Xe đã khởi hành', icon: <Truck size={18} />, items: departed, tone: 'border-blue-200 bg-blue-50 text-blue-700' },
      { key: 'expected', title: 'Dự kiến đến', icon: <CalendarClock size={18} />, items: expected, tone: 'border-amber-200 bg-amber-50 text-amber-700' },
    ];
  }, [manifest]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      {(error || message) && <Alert message={error || message} tone={error ? 'red' : 'green'} />}
      <div className="rounded-2xl border border-border bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <button onClick={() => navigate(-1)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-muted-foreground hover:bg-muted"><ArrowLeft size={15} />Quay lại</button>
          <div className="relative min-w-0 flex-1 md:max-w-[520px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm mã bảng kê, seal, chuyến xe..." className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-[13px] font-medium outline-none focus:ring-2 focus:ring-primary/10" /></div>
          <button onClick={() => void loadManifest()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-muted-foreground hover:bg-muted"><RefreshCcw size={15} />Tải lại</button>
          {manifest && <button type="button" onClick={() => openDispatchSheet(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[13px] font-bold text-emerald-700 hover:bg-emerald-100"><Printer size={15} />In bảng kê</button>}
        </div>
        <div className="p-4">
          {isLoading ? <StateBlock icon={<Loader2 size={22} className="animate-spin" />} title="Đang tải bảng kê..." /> : !manifest ? <StateBlock icon={<AlertTriangle size={22} />} title="Không tìm thấy bảng kê." /> : (
            <div className="grid min-h-[520px] gap-4 lg:grid-cols-2">
              {kanbanColumns.map((column) => <KanbanColumn key={column.key} title={column.title} icon={column.icon} tone={column.tone} count={column.items.length}>{column.items.length ? column.items.map((item) => <ManifestKanbanCard key={item.id} manifest={item} waybillCount={links.length} isSaving={isSaving} onOpen={() => openDispatchSheet(false)} onPrint={() => openDispatchSheet(true)} onSaveExpectedArrival={saveExpectedArrival} />) : <EmptyColumn title="Chưa có bảng kê ở trạng thái này" />}</KanbanColumn>)}
            </div>
          )}
        </div>
      </div>
      {manifest && isDialogOpen && (
        <DispatchSheetDialog
          manifest={manifest}
          links={filteredLinks}
          rows={rows}
          keyword={keyword}
          isSaving={isSaving}
          visibleColumnIds={visibleColumnIds}
          showPricing={showPricing}
          onKeywordChange={setKeyword}
          onCellChange={updateCell}
          onVisibleColumnsChange={updateVisibleColumns}
          onSave={saveRows}
          onClose={() => setIsDialogOpen(false)}
        />
      )}
    </div>
  );
}

function ManifestKanbanCard({ manifest, waybillCount, isSaving, onOpen, onPrint, onSaveExpectedArrival }: { manifest: LoadPlanningManifest; waybillCount: number; isSaving: boolean; onOpen: () => void; onPrint: () => void; onSaveExpectedArrival: (manifest: LoadPlanningManifest, value: string) => Promise<void> }) {
  const [isEditingArrival, setIsEditingArrival] = useState(false);
  const [arrivalValue, setArrivalValue] = useState(() => toDateTimeLocalValue(expectedArrival(manifest)));

  const saveArrival = async () => {
    await onSaveExpectedArrival(manifest, arrivalValue);
    setIsEditingArrival(false);
  };

  return <article className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors duration-200 hover:border-primary/30 hover:bg-blue-50/20">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Bảng kê</p><h3 className="mt-1 truncate text-lg font-black text-primary">{manifestCode(manifest)}</h3></div>
      <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-black text-emerald-700">{display(manifest.status)}</span>
    </div>
    <div className="mt-3 flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-[13px] font-black text-blue-800">
      <span className="rounded-full bg-white px-2.5 py-1">{hubLabel(manifest.origin_hub, manifest.origin_hub_id)}</span>
      <ArrowRight size={15} className="shrink-0 text-blue-500" />
      <span className="rounded-full bg-white px-2.5 py-1">{hubLabel(manifest.dest_hub, manifest.dest_hub_id)}</span>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] font-semibold text-foreground">
      <Metric label="Vận đơn" value={formatNumber(manifest.waybill_count ?? manifest.total_waybills ?? waybillCount)} />
      <Metric label="Trọng lượng" value={formatNumber(manifest.total_weight ?? manifest.weight_total, ' kg')} />
    </div>
    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[13px] font-semibold text-foreground">
      <Line icon={<Truck size={15} />} label="Biển số xe" value={truckLabel(manifest)} />
      <Line icon={<UserRound size={15} />} label="Tài xế" value={driverLabel(manifest)} />
      <Line icon={<Phone size={15} />} label="SĐT" value={driverPhoneLabel(manifest)} />
      <Line icon={<CalendarClock size={15} />} label="Thời gian đóng" value={formatDateTime(manifest.closed_at || manifest.created_at)} />
      <Line icon={<CalendarClock size={15} />} label="Ngày dự kiến đến" value={isEditingArrival ? <span className="flex flex-wrap justify-end gap-2"><DateTimePicker value={arrivalValue} onChange={setArrivalValue} disabled={isSaving} placeholder="Chọn ngày đến" className="h-8" /><button disabled={isSaving} onClick={() => void saveArrival()} className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-2 text-[12px] font-black text-white disabled:opacity-50">{isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Lưu</button><button disabled={isSaving} onClick={() => { setArrivalValue(toDateTimeLocalValue(expectedArrival(manifest))); setIsEditingArrival(false); }} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-white px-2 text-[12px] font-black text-muted-foreground disabled:opacity-50"><X size={13} />Hủy</button></span> : <span className="flex items-center justify-end gap-2"><span>{formatDateTime(expectedArrival(manifest))}</span><button onClick={() => { setArrivalValue(toDateTimeLocalValue(expectedArrival(manifest))); setIsEditingArrival(true); }} className="inline-flex h-7 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 text-[12px] font-black text-amber-700 hover:bg-amber-100"><Edit3 size={13} />Sửa</button></span>} />
    </div>
    <div className="mt-3 rounded-2xl bg-slate-900 px-3 py-2 text-[13px] font-black text-white">{tripLabel(manifest)}</div>
    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
      <button type="button" onClick={onOpen} className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-black text-white transition-colors duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20"><Eye size={16} />Xem chi tiết</button>
      <button type="button" onClick={onPrint} className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-[13px] font-black text-emerald-700 transition-colors duration-200 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-200"><Printer size={16} />In bảng kê</button>
    </div>
  </article>;
}

function DispatchSheetDialog(props: {
  manifest: LoadPlanningManifest;
  links: RowLink[];
  rows: EditableRows;
  keyword: string;
  isSaving: boolean;
  visibleColumnIds: DispatchPrintColumnId[];
  showPricing: boolean;
  onKeywordChange: (value: string) => void;
  onCellChange: (waybillId: string, key: DispatchFieldKey, value: string) => void;
  onVisibleColumnsChange: (ids: DispatchPrintColumnId[]) => void;
  onSave: () => Promise<void>;
  onClose: () => void;
}) {
  const { manifest, links, rows, keyword, isSaving, visibleColumnIds, showPricing, onKeywordChange, onCellChange, onVisibleColumnsChange, onSave, onClose } = props;

  return <div className="manifest-dispatch-print-root fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 print:static print:block print:bg-white print:p-0">
    <style>{`@media print { body > *:not(.manifest-dispatch-print-root) { display: none !important; } .manifest-dispatch-print-root { display: block !important; position: static !important; inset: auto !important; background: #fff !important; padding: 0 !important; } .manifest-dispatch-print-panel { display: block !important; max-height: none !important; max-width: none !important; overflow: visible !important; border-radius: 0 !important; box-shadow: none !important; } .manifest-dispatch-print-toolbar { display: none !important; } .manifest-dispatch-print-body { display: block !important; overflow: visible !important; max-height: none !important; } }`}</style>
    <div className="manifest-dispatch-print-panel flex max-h-[92vh] w-full max-w-[96vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="manifest-dispatch-print-toolbar flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-3">
        <button type="button" onClick={onClose} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-muted-foreground hover:bg-muted"><X size={15} />Đóng</button>
        <div className="relative min-w-0 flex-1 md:max-w-[520px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={keyword} onChange={(event) => onKeywordChange(event.target.value)} placeholder="Tìm mã vận đơn, người gửi, người nhận..." className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-[13px] font-medium outline-none focus:ring-2 focus:ring-primary/10" /></div>
        <DispatchPrintColumnDropdown value={visibleColumnIds} canViewPricing={showPricing} onChange={onVisibleColumnsChange} className="w-[180px]" />
        <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[13px] font-bold text-emerald-700 hover:bg-emerald-100"><Printer size={15} />In bảng kê</button>
        <button disabled={isSaving} onClick={() => void onSave()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-extrabold text-white hover:bg-primary/90 disabled:opacity-50">{isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}Lưu thay đổi</button>
      </div>
      <div className="shrink-0 border-b border-border px-4 py-3 text-center"><h2 className="text-[16px] font-black uppercase tracking-wide text-foreground">BẢNG KÊ PHÁT HÀNG ECO</h2><p className="mt-1 text-[12px] font-bold text-muted-foreground">{manifestCode(manifest)} · {links.length} dòng hàng</p></div>
      <div className="manifest-dispatch-print-body min-h-0 flex-1 overflow-auto custom-scrollbar">
        <ManifestDispatchSheetTable
          manifest={manifest}
          links={links}
          rows={rows}
          visibleColumnIds={visibleColumnIds}
          onCellChange={onCellChange}
        />
      </div>
    </div>
  </div>;
}

function KanbanColumn({ title, icon, tone, count, children }: { title: string; icon: ReactNode; tone: string; count: number; children: ReactNode }) {
  return <section className="flex min-h-[480px] flex-col rounded-2xl border border-border bg-slate-50/80"><div className={`flex items-center justify-between rounded-t-2xl border-b px-4 py-3 ${tone}`}><div className="flex items-center gap-2 text-[14px] font-black">{icon}<span>{title}</span></div><span className="rounded-full bg-white px-2.5 py-1 text-[12px] font-black text-foreground">{count}</span></div><div className="flex-1 space-y-3 overflow-auto p-3 custom-scrollbar">{children}</div></section>;
}

function EmptyColumn({ title }: { title: string }) {
  return <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-border bg-white text-center text-[13px] font-bold text-muted-foreground">{title}</div>;
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2"><p className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-[15px] font-black text-slate-950">{value}</p></div>;
}

function Line({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return <div className="flex items-center justify-between gap-3 border-b border-slate-200 py-2 last:border-b-0"><span className="flex items-center gap-2 text-muted-foreground">{icon}{label}</span><span className="text-right font-black text-slate-950">{value}</span></div>;
}

function Alert({ message, tone }: { message: string; tone: 'red' | 'green' }) {
  return <div className={`shrink-0 rounded-xl border px-4 py-3 text-[13px] font-bold ${tone === 'red' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{message}</div>;
}

function StateBlock({ icon, title }: { icon: ReactNode; title: string }) {
  return <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center text-muted-foreground"><div className="text-primary">{icon}</div><p className="text-[13px] font-bold">{title}</p></div>;
}
