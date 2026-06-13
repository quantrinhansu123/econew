import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Edit3, Loader2, MapPin, Plus, Search, Trash2 } from 'lucide-react';
import { ApiError, apiRequest } from '../../lib/api';

type AttendanceLocation = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
  created_at: string;
};

type AttendanceLog = {
  id: string;
  type: 'check_in' | 'check_out';
  status: 'success' | 'failed';
  user_latitude: number;
  user_longitude: number;
  accuracy: number | null;
  distance_meters: number | null;
  accuracy_warning: boolean;
  failure_reason: string | null;
  created_at: string;
  user?: { id: string; username: string; full_name: string };
  location?: AttendanceLocation | null;
};

type LogResponse = { items: AttendanceLog[]; meta: { total: number } };
type FormState = { name: string; address: string; latitude: string; longitude: string; radius_meters: string; is_active: boolean };
type Filters = { date: string; userId: string; locationId: string };

const emptyForm: FormState = { name: '', address: '', latitude: '', longitude: '', radius_meters: '100', is_active: true };
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function AdminAttendanceLocationsPage() {
  const [locations, setLocations] = useState<AttendanceLocation[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [filters, setFilters] = useState<Filters>({ date: todayIso(), userId: '', locationId: '' });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<AttendanceLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const activeCount = useMemo(() => locations.filter((location) => location.is_active).length, [locations]);

  const loadLocations = useCallback(async () => {
    const res = await apiRequest<AttendanceLocation[]>('/attendance/locations');
    setLocations(res);
  }, []);

  const loadLogs = useCallback(async () => {
    const params = new URLSearchParams({ limit: '100' });
    if (filters.date) params.set('date', filters.date);
    if (filters.userId.trim()) params.set('userId', filters.userId.trim());
    if (filters.locationId) params.set('locationId', filters.locationId);
    const res = await apiRequest<LogResponse>(`/attendance/logs?${params}`);
    setLogs(res.items ?? []);
  }, [filters]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadLocations(), loadLogs()]);
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : 'Không tải được dữ liệu chấm công.');
    } finally {
      setLoading(false);
    }
  }, [loadLocations, loadLogs]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function openEdit(location: AttendanceLocation) {
    setEditing(location);
    setForm({
      name: location.name,
      address: location.address ?? '',
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      radius_meters: String(location.radius_meters),
      is_active: location.is_active,
    });
    setNotice('');
  }

  function resetForm() {
    setEditing(null);
    setForm(emptyForm);
  }

  async function submitForm() {
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address.trim() || undefined,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        radius_meters: Number(form.radius_meters),
        is_active: form.is_active,
      };
      if (editing) {
        await apiRequest(`/attendance/locations/${editing.id}`, { method: 'PUT', body: payload });
        setNotice('Đã cập nhật điểm chấm công.');
      } else {
        await apiRequest('/attendance/locations', { method: 'POST', body: payload });
        setNotice('Đã tạo điểm chấm công.');
      }
      resetForm();
      await loadLocations();
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : 'Không lưu được điểm chấm công.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleLocation(location: AttendanceLocation) {
    await apiRequest(`/attendance/locations/${location.id}/toggle`, { method: 'PATCH' });
    await loadLocations();
  }

  async function deleteLocation(location: AttendanceLocation) {
    if (!window.confirm(`Xóa điểm chấm công ${location.name}?`)) return;
    await apiRequest(`/attendance/locations/${location.id}`, { method: 'DELETE' });
    await loadLocations();
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-4 p-4 md:p-6 overflow-auto custom-scrollbar">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wide text-primary">Attendance Admin</p>
          <h1 className="text-2xl font-black text-foreground">Quản lý điểm chấm công</h1>
          <p className="text-sm text-muted-foreground">Tạo điểm GPS, bật/tắt và audit toàn bộ lịch sử chấm công.</p>
        </div>
        <div className="flex gap-2">
          <SummaryCard label="Tổng điểm" value={locations.length} />
          <SummaryCard label="Đang bật" value={activeCount} />
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
      {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div>}

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-3xl border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Plus size={22} /></div><div><h2 className="text-lg font-black">{editing ? 'Sửa điểm' : 'Thêm điểm mới'}</h2><p className="text-sm text-muted-foreground">Bán kính cho phép 50–500m.</p></div></div>
          <div className="mt-4 grid gap-3">
            <Input label="Tên điểm" value={form.name} onChange={(value) => setForm((prev) => ({ ...prev, name: value }))} />
            <Input label="Địa chỉ" value={form.address} onChange={(value) => setForm((prev) => ({ ...prev, address: value }))} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Latitude" value={form.latitude} onChange={(value) => setForm((prev) => ({ ...prev, latitude: value }))} />
              <Input label="Longitude" value={form.longitude} onChange={(value) => setForm((prev) => ({ ...prev, longitude: value }))} />
            </div>
            <label className="grid gap-2 text-sm font-bold text-foreground">Bán kính: {form.radius_meters}m<input type="range" min="50" max="500" step="10" value={form.radius_meters} onChange={(event) => setForm((prev) => ({ ...prev, radius_meters: event.target.value }))} /></label>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))} /> Đang hoạt động</label>
            <div className="flex gap-2">
              <button type="button" disabled={submitting} onClick={() => void submitForm()} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-white hover:bg-primary/90 disabled:opacity-50">{submitting ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />} Lưu</button>
              {editing && <button type="button" onClick={resetForm} className="h-11 rounded-xl border border-border px-4 text-sm font-bold hover:bg-muted">Hủy</button>}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="border-b border-border px-5 py-4"><h2 className="text-lg font-black">Danh sách điểm</h2></div>
          <div className="overflow-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted-foreground"><tr>{['Tên', 'Tọa độ', 'Bán kính', 'Trạng thái', 'Hành động'].map((h) => <th key={h} className="px-4 py-3 font-black">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">{locations.map((location) => <LocationRow key={location.id} location={location} onEdit={openEdit} onToggle={toggleLocation} onDelete={deleteLocation} />)}</tbody>
            </table>
            {!locations.length && <EmptyState text={loading ? 'Đang tải điểm chấm công...' : 'Chưa có điểm chấm công.'} />}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="border-b border-border p-4 space-y-3">
          <div className="flex items-center gap-2"><Search size={18} className="text-primary" /><h2 className="text-lg font-black">Lịch sử chấm công</h2></div>
          <div className="grid gap-2 md:grid-cols-3">
            <input type="date" value={filters.date} onChange={(event) => setFilters((prev) => ({ ...prev, date: event.target.value }))} className="h-10 rounded-xl border border-border px-3 text-sm font-semibold outline-none focus:border-primary" />
            <input value={filters.userId} onChange={(event) => setFilters((prev) => ({ ...prev, userId: event.target.value }))} placeholder="Lọc theo userId" className="h-10 rounded-xl border border-border px-3 text-sm font-semibold outline-none focus:border-primary" />
            <select value={filters.locationId} onChange={(event) => setFilters((prev) => ({ ...prev, locationId: event.target.value }))} className="h-10 rounded-xl border border-border px-3 text-sm font-semibold outline-none focus:border-primary"><option value="">Tất cả điểm</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted-foreground"><tr>{['Thời gian', 'Nhân viên', 'Loại', 'Địa điểm', 'Khoảng cách', 'GPS', 'Trạng thái', 'Lý do'].map((h) => <th key={h} className="px-4 py-3 font-black">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">{logs.map((log) => <LogRow key={log.id} log={log} />)}</tbody>
          </table>
          {!logs.length && <EmptyState text="Không có log phù hợp bộ lọc." />}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-border bg-white px-4 py-3 shadow-sm"><p className="text-[11px] font-bold uppercase text-muted-foreground">{label}</p><p className="text-xl font-black text-foreground">{value}</p></div>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-1 text-sm font-bold text-foreground">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-xl border border-border px-3 text-sm font-semibold outline-none focus:border-primary" /></label>;
}

function LocationRow({ location, onEdit, onToggle, onDelete }: { location: AttendanceLocation; onEdit: (location: AttendanceLocation) => void; onToggle: (location: AttendanceLocation) => void; onDelete: (location: AttendanceLocation) => void }) {
  return <tr className="hover:bg-muted/40"><td className="px-4 py-3"><p className="font-black">{location.name}</p><p className="text-xs text-muted-foreground">{location.address || 'Chưa có địa chỉ'}</p></td><td className="px-4 py-3 font-mono text-xs">{location.latitude}, {location.longitude}</td><td className="px-4 py-3">{location.radius_meters}m</td><td className="px-4 py-3"><button type="button" onClick={() => void onToggle(location)} className={`rounded-full px-3 py-1 text-xs font-black ${location.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{location.is_active ? 'Đang bật' : 'Tạm tắt'}</button></td><td className="px-4 py-3"><div className="flex gap-2"><button type="button" onClick={() => onEdit(location)} className="rounded-lg border border-border p-2 hover:bg-muted"><Edit3 size={16} /></button><button type="button" onClick={() => void onDelete(location)} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"><Trash2 size={16} /></button></div></td></tr>;
}

function LogRow({ log }: { log: AttendanceLog }) {
  return <tr className="hover:bg-muted/40"><td className="px-4 py-3 font-semibold">{new Date(log.created_at).toLocaleString('vi-VN')}</td><td className="px-4 py-3">{log.user?.full_name || log.user?.username || log.user?.id || '—'}</td><td className="px-4 py-3">{log.type === 'check_in' ? 'Check-in' : 'Check-out'}</td><td className="px-4 py-3">{log.location?.name ?? '—'}</td><td className="px-4 py-3">{log.distance_meters == null ? '—' : `${Math.round(log.distance_meters)}m`}</td><td className="px-4 py-3">{log.accuracy == null ? '—' : `${Math.round(log.accuracy)}m`}{log.accuracy_warning ? ' · cảnh báo' : ''}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${log.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{log.status === 'success' ? 'Thành công' : 'Thất bại'}</span></td><td className="px-4 py-3 text-xs text-muted-foreground">{log.failure_reason ?? '—'}</td></tr>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex items-center justify-center gap-2 p-6 text-sm font-semibold text-muted-foreground"><MapPin size={18} />{text}</div>;
}
