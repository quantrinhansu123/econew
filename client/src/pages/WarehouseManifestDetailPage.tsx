import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarClock, Eye, Loader2, PackageCheck, Phone, Printer, RefreshCcw, Save, Search, Truck, UserRound, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/api';
import type { LoadPlanningManifest, ManifestDispatchFields, ManifestWaybill } from './warehouse/manifests/types';

const editableColumns = [
  { key: 'ngay_boc', label: 'Ngày bốc', className: 'min-w-[76px]' },
  { key: 'ma_tinh', label: 'Mã Tỉnh', className: 'min-w-[86px]' },
  { key: 'ten_cty', label: 'Tên CTY', className: 'min-w-[120px]' },
  { key: 'dv', label: 'DV', className: 'min-w-[58px]' },
  { key: 'mat_hang', label: 'Mặt Hàng', className: 'min-w-[180px]' },
  { key: 'noi_tra', label: 'Nơi Trả', className: 'min-w-[130px]' },
  { key: 'so_luong', label: 'Số Lượng', className: 'min-w-[76px]' },
  { key: 'loai', label: '', className: 'min-w-[58px]' },
  { key: 'dia_chi', label: '', className: 'min-w-[300px]' },
  { key: 'ghi_chu_1', label: 'Ghi chú', className: 'min-w-[140px]' },
  { key: 'ghi_chu_2', label: '', className: 'min-w-[160px]' },
  { key: 'ke_hoach', label: 'kế hoạch', className: 'min-w-[150px]' },
  { key: 'lai_xe_thu_ho', label: 'Lái xe thu hộ', className: 'min-w-[110px]' },
  { key: 'bc_thu_ho', label: 'BC thu hộ', className: 'min-w-[92px]' },
  { key: 'ma_bill', label: 'Mã Bill', className: 'min-w-[110px]' },
  { key: 'ghi_chu_bill', label: 'Ghi chú', className: 'min-w-[140px]' },
  { key: 'kg', label: 'kg', className: 'min-w-[72px]' },
  { key: 'm3', label: 'm3', className: 'min-w-[72px]' },
  { key: 'qd', label: 'QĐ', className: 'min-w-[72px]' },
  { key: 'du_kien_toi_hcm', label: 'Dự kiến tới HCM:', className: 'min-w-[120px] bg-yellow-300' },
  { key: 'trang_thai_giao', label: '', className: 'min-w-[120px] bg-green-200' },
] as const;

type EditableKey = (typeof editableColumns)[number]['key'];
type RowLink = { waybill_id?: string | number | null; loading_position?: string | number | null; loaded_at?: string | null; dispatch_fields?: ManifestDispatchFields | null; waybill?: ManifestWaybill | null };
type EditableRows = Record<string, ManifestDispatchFields>;

const display = (value?: string | number | null, fallback = '—') => (value == null || value === '' ? fallback : String(value));
const blank = (value?: string | number | null) => (value == null || value === '' ? '' : String(value));
const manifestCode = (manifest?: LoadPlanningManifest | null) => manifest?.manifest_code || manifest?.code || (manifest ? `MF-${manifest.id}` : '—');
const hubLabel = (hub?: { code?: string | null; name?: string | null } | null, id?: string | number | null) => hub?.code || hub?.name || (id ? `Hub #${id}` : '—');
const manifestTrip = (manifest: LoadPlanningManifest) => manifest.trip ?? manifest.trips?.[0] ?? null;
const tripLabel = (manifest: LoadPlanningManifest) => manifestTrip(manifest)?.trip_code || manifestTrip(manifest)?.code || (manifest.trip_id ? `Chuyến #${manifest.trip_id}` : 'Chưa gán chuyến');
const truckLabel = (manifest: LoadPlanningManifest) => manifestTrip(manifest)?.truck?.bks || manifestTrip(manifest)?.truck?.license_plate || 'Chưa có xe';
const driverLabel = (manifest: LoadPlanningManifest) => manifestTrip(manifest)?.driver_name || manifestTrip(manifest)?.driver?.name || manifestTrip(manifest)?.driver?.full_name || manifestTrip(manifest)?.truck?.ten_lai_xe || manifestTrip(manifest)?.truck?.driver?.name || manifestTrip(manifest)?.truck?.driver?.full_name || 'Chưa gán tài xế';
const driverPhoneLabel = (manifest: LoadPlanningManifest) => manifestTrip(manifest)?.driver_phone || manifestTrip(manifest)?.driver?.phone || manifestTrip(manifest)?.truck?.driver?.phone || manifestTrip(manifest)?.truck?.phone || 'Chưa có SĐT';
const parseName = (info?: string | null) => (info || '').split('|')[0]?.trim() || '';
const formatNumber = (value?: string | number | null, suffix = '') => value == null || value === '' ? '—' : `${Number(value).toLocaleString('vi-VN')}${suffix}`;
const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};
const formatShortDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date);
};

function rowKey(link: RowLink) {
  return String(link.waybill_id ?? link.waybill?.id ?? '');
}

function normalizeLinks(manifest: LoadPlanningManifest | null): RowLink[] {
  if (!manifest) return [];
  if (manifest.manifest_waybills?.length) return manifest.manifest_waybills as RowLink[];
  return (manifest.waybills ?? []).map((waybill, index) => ({ waybill_id: waybill.id, loading_position: index + 1, dispatch_fields: waybill.dispatch_fields, waybill }));
}

function defaultField(link: RowLink, key: EditableKey) {
  const waybill = link.waybill;
  switch (key) {
    case 'ngay_boc': return formatShortDate(link.loaded_at ?? null);
    case 'ma_tinh': return blank(waybill?.noi_den || waybill?.dest_hub_id);
    case 'ten_cty': return parseName(waybill?.sender_info);
    case 'dv': return 'TC';
    case 'mat_hang': return blank((waybill as { item_name?: string | null } | undefined)?.item_name || waybill?.waybill_code);
    case 'noi_tra': return blank(waybill?.noi_den || waybill?.dest_hub_id);
    case 'so_luong': return blank(waybill?.package_count) || '1';
    case 'loai': return 'kiện';
    case 'dia_chi': return blank(waybill?.receiver_address || waybill?.receiver_info);
    case 'ma_bill': return blank(waybill?.waybill_code);
    case 'kg': return blank(waybill?.weight);
    case 'm3': return blank(waybill?.the_tich_m3 || waybill?.volumetric_weight);
    default: return '';
  }
}

function getCellValue(rows: EditableRows, link: RowLink, key: EditableKey) {
  const saved = rows[rowKey(link)]?.[key];
  return saved == null ? defaultField(link, key) : String(saved);
}

function isArrived(manifest: LoadPlanningManifest) {
  return ['COMPLETED', 'ARRIVED', 'AT_DEST_HUB', 'Xe đã đến'].includes(String(manifest.trip?.status || manifest.status || ''));
}

export default function WarehouseManifestDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [manifest, setManifest] = useState<LoadPlanningManifest | null>(null);
  const [rows, setRows] = useState<EditableRows>({});
  const [keyword, setKeyword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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

  const links = useMemo(() => normalizeLinks(manifest).sort((a, b) => Number(a.loading_position ?? 9999) - Number(b.loading_position ?? 9999)), [manifest]);
  const filteredLinks = useMemo(() => {
    const search = keyword.trim().toLowerCase();
    if (!search) return links;
    return links.filter((link) => [link.waybill?.waybill_code, link.waybill?.sender_info, link.waybill?.receiver_info].some((value) => String(value || '').toLowerCase().includes(search)));
  }, [links, keyword]);

  function updateCell(waybillId: string, key: EditableKey, value: string) {
    setRows((prev) => ({ ...prev, [waybillId]: { ...(prev[waybillId] ?? {}), [key]: value } }));
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
        </div>
        <div className="p-4">
          {isLoading ? <StateBlock icon={<Loader2 size={22} className="animate-spin" />} title="Đang tải bảng kê..." /> : !manifest ? <StateBlock icon={<AlertTriangle size={22} />} title="Không tìm thấy bảng kê." /> : (
            <div className="grid min-h-[520px] gap-4 lg:grid-cols-2">
              {kanbanColumns.map((column) => <KanbanColumn key={column.key} title={column.title} icon={column.icon} tone={column.tone} count={column.items.length}>{column.items.length ? column.items.map((item) => <ManifestKanbanCard key={item.id} manifest={item} waybillCount={links.length} onOpen={() => setIsDialogOpen(true)} />) : <EmptyColumn title="Chưa có bảng kê ở trạng thái này" />}</KanbanColumn>)}
            </div>
          )}
        </div>
      </div>
      {manifest && isDialogOpen && <DispatchSheetDialog manifest={manifest} links={filteredLinks} rows={rows} keyword={keyword} isSaving={isSaving} onKeywordChange={setKeyword} onCellChange={updateCell} onSave={saveRows} onClose={() => setIsDialogOpen(false)} />}
    </div>
  );
}

function ManifestKanbanCard({ manifest, waybillCount, onOpen }: { manifest: LoadPlanningManifest; waybillCount: number; onOpen: () => void }) {
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
    </div>
    <div className="mt-3 rounded-2xl bg-slate-900 px-3 py-2 text-[13px] font-black text-white">{tripLabel(manifest)}</div>
    <button onClick={onOpen} className="mt-4 inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-black text-white transition-colors duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20"><Eye size={16} />Xem chi tiết bảng kê</button>
  </article>;
}

function DispatchSheetDialog(props: { manifest: LoadPlanningManifest; links: RowLink[]; rows: EditableRows; keyword: string; isSaving: boolean; onKeywordChange: (value: string) => void; onCellChange: (waybillId: string, key: EditableKey, value: string) => void; onSave: () => Promise<void>; onClose: () => void }) {
  const { manifest, links, rows, keyword, isSaving, onKeywordChange, onCellChange, onSave, onClose } = props;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
    <div className="flex max-h-[92vh] w-full max-w-[96vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-3">
        <button onClick={onClose} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-muted-foreground hover:bg-muted"><X size={15} />Đóng</button>
        <div className="relative min-w-0 flex-1 md:max-w-[520px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={keyword} onChange={(event) => onKeywordChange(event.target.value)} placeholder="Tìm mã vận đơn, người gửi, người nhận..." className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-[13px] font-medium outline-none focus:ring-2 focus:ring-primary/10" /></div>
        <button onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[13px] font-bold text-emerald-700 hover:bg-emerald-100"><Printer size={15} />In</button>
        <button disabled={isSaving} onClick={() => void onSave()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-extrabold text-white hover:bg-primary/90 disabled:opacity-50">{isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}Lưu thay đổi</button>
      </div>
      <div className="shrink-0 border-b border-border px-4 py-3 text-center"><h2 className="text-[16px] font-black uppercase tracking-wide text-foreground">BẢNG KÊ PHÁT HÀNG ECO</h2><p className="mt-1 text-[12px] font-bold text-muted-foreground">{manifestCode(manifest)} · {links.length} dòng hàng</p></div>
      <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
        {!links.length ? <StateBlock icon={<PackageCheck size={22} />} title="Bảng kê chưa có dòng hàng phù hợp." /> : <table className="w-full min-w-[2100px] border-collapse text-center text-[12px] text-slate-950">
          <thead><tr><th colSpan={editableColumns.length + 1} className="border border-slate-700 bg-white py-1 text-[14px] font-black">BẢNG KÊ PHÁT HÀNG ECO</th></tr><tr className="bg-green-50 text-[11px] font-black"><th className="w-14 border border-slate-700 bg-yellow-300 px-1 py-2">Vị trí hàng</th>{editableColumns.map((column) => <th key={column.key} className={`border border-slate-700 px-1 py-2 ${column.className}`}>{column.label}</th>)}</tr></thead>
          <tbody>{links.map((link, index) => { const waybillId = rowKey(link); return <tr key={waybillId || index} className="align-middle odd:bg-white even:bg-slate-50"><td className="border border-slate-700 bg-yellow-300 px-1 py-2 font-black text-blue-900">{link.loading_position ?? index + 1}</td>{editableColumns.map((column) => <td key={column.key} className={`border border-slate-700 p-0 ${column.key === 'trang_thai_giao' ? 'bg-green-200' : column.key === 'du_kien_toi_hcm' ? 'bg-green-100' : ''}`}><textarea value={getCellValue(rows, link, column.key)} onChange={(event) => onCellChange(waybillId, column.key, event.target.value)} className="min-h-[50px] w-full resize-y border-0 bg-transparent px-1.5 py-2 text-center text-[12px] font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-primary/30" /></td>)}</tr>; })}</tbody>
        </table>}
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
