import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Crosshair, Edit3, Loader2, MapPin, Plus, Search, Trash2, Wifi } from 'lucide-react';
import { ApiError, apiRequest } from '../../lib/api';
import { getStoredAuthUser } from '../../lib/authUser';
import { getAttendanceNetwork } from './attendanceApi';
import type { AttendanceLocation, AttendanceLog, AttendanceMethod } from './attendanceTypes';

type LogResponse = { items: AttendanceLog[]; meta: { total: number } };
type FormState = { name: string; address: string; latitude: string; longitude: string; radius_meters: string; is_active: boolean; verification_method: AttendanceMethod; allowed_ips: string };
type Filters = { date: string; userId: string; locationId: string };

const emptyForm: FormState = { name: '', address: '', latitude: '', longitude: '', radius_meters: '100', is_active: true, verification_method: 'gps', allowed_ips: '' };
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const geolocationOptions: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000,
  maximumAge: 0,
};

const gpsErrorMessage = (error: GeolocationPositionError) => {
  if (error.code === error.PERMISSION_DENIED) return 'Trình duyệt đã từ chối quyền GPS. Vui lòng cấp quyền vị trí rồi thử lại.';
  if (error.code === error.POSITION_UNAVAILABLE) return 'Không lấy được vị trí hiện tại. Vui lòng kiểm tra GPS/mạng.';
  if (error.code === error.TIMEOUT) return 'Lấy vị trí quá thời gian chờ. Vui lòng thử lại ở nơi tín hiệu tốt hơn.';
  return 'Không thể lấy vị trí GPS.';
};

export default function AdminAttendanceLocationsPage() {
  const canManage = ((getStoredAuthUser()?.role_mask ?? 0) & (32 | 64)) !== 0;
  const [locations, setLocations] = useState<AttendanceLocation[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [filters, setFilters] = useState<Filters>({ date: todayIso(), userId: '', locationId: '' });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<AttendanceLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [detectingIp, setDetectingIp] = useState(false);
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
    try {
      await Promise.all([loadLocations(), loadLogs()]);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : 'Không tải được dữ liệu chấm công.');
    } finally {
      setLoading(false);
    }
  }, [loadLocations, loadLogs]);

  useEffect(() => {
    startTransition(async () => { await loadAll(); });
  }, [loadAll]);

  function openEdit(location: AttendanceLocation) {
    if (locating || detectingIp || submitting) return;
    setEditing(location);
    setForm({
      name: location.name,
      address: location.address ?? '',
      latitude: location.latitude == null ? '' : String(location.latitude),
      longitude: location.longitude == null ? '' : String(location.longitude),
      radius_meters: String(location.radius_meters),
      is_active: location.is_active,
      verification_method: location.verification_method,
      allowed_ips: (location.allowed_ips ?? []).join('\n'),
    });
    setNotice('');
  }

  function resetForm() {
    setEditing(null);
    setForm(emptyForm);
  }

  async function captureCurrentIp() {
    setDetectingIp(true);
    setError('');
    setNotice('');
    try {
      const network = await getAttendanceNetwork();
      if (!network.is_public || !network.ip) {
        setError(`Chưa lấy được IP public của mạng văn phòng${network.ip ? ` (đang nhận ${network.ip})` : ''}. Hãy mở hệ thống đã triển khai; nếu vẫn gặp lỗi, cần kiểm tra cấu hình proxy.`);
        return;
      }
      // Replace the old IP on purpose: a previous dynamic IP may be reassigned.
      setForm((prev) => ({ ...prev, allowed_ips: network.ip! }));
      setNotice(`Đã lấy IP ${network.ip}. Bấm Lưu để đăng ký hoặc cập nhật mạng chấm công.`);
    } catch (ipError) {
      setError(ipError instanceof ApiError ? ipError.message : 'Không lấy được IP mạng hiện tại.');
    } finally {
      setDetectingIp(false);
    }
  }

  const getPosition = () => new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Trình duyệt không hỗ trợ GPS.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, geolocationOptions);
  });

  async function captureCurrentLocation() {
    setLocating(true);
    setError('');
    setNotice('Đang xin quyền GPS và lấy vị trí hiện tại của admin...');
    try {
      const position = await getPosition();
      setForm((prev) => ({
        ...prev,
        latitude: String(position.coords.latitude),
        longitude: String(position.coords.longitude),
      }));
      setNotice(`Đã lấy vị trí hiện tại. Độ chính xác khoảng ${Math.round(position.coords.accuracy)}m.`);
    } catch (locationError) {
      setNotice('');
      if (locationError && typeof locationError === 'object' && 'code' in locationError && typeof locationError.code === 'number') {
        setError(gpsErrorMessage(locationError as GeolocationPositionError));
      } else if (locationError instanceof Error) {
        setError(locationError.message);
      } else {
        setError('Không thể lấy vị trí GPS.');
      }
    } finally {
      setLocating(false);
    }
  }

  async function submitForm() {
    if (!form.name.trim()) {
      setError('Vui lòng nhập tên điểm chấm công.');
      return;
    }
    if (form.verification_method === 'gps' && (!form.latitude || !form.longitude)) {
      setError('Vui lòng bấm “Lấy vị trí hiện tại” trước khi lưu điểm chấm công.');
      return;
    }
    const allowedIps = form.allowed_ips.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean);
    if (form.verification_method === 'ip' && !allowedIps.length) {
      setError('Vui lòng bấm “Lấy IP mạng hiện tại” hoặc nhập IP public trước khi lưu.');
      return;
    }
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address.trim(),
        latitude: form.verification_method === 'gps' ? Number(form.latitude) : undefined,
        longitude: form.verification_method === 'gps' ? Number(form.longitude) : undefined,
        radius_meters: Number(form.radius_meters),
        is_active: form.is_active,
        verification_method: form.verification_method,
        allowed_ips: form.verification_method === 'ip' ? allowedIps : [],
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
    try {
      await apiRequest(`/attendance/locations/${location.id}/toggle`, { method: 'PATCH' });
      await loadLocations();
    } catch (actionError) {
      setError(actionError instanceof ApiError ? actionError.message : 'Không cập nhật được trạng thái điểm.');
    }
  }

  async function deleteLocation(location: AttendanceLocation) {
    if (!window.confirm(`Xóa điểm chấm công ${location.name}?`)) return;
    try {
      await apiRequest(`/attendance/locations/${location.id}`, { method: 'DELETE' });
      if (editing?.id === location.id) resetForm();
      await loadLocations();
    } catch (actionError) {
      setError(actionError instanceof ApiError ? actionError.message : 'Không xóa được điểm chấm công.');
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-4 p-4 md:p-6 overflow-auto custom-scrollbar">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wide text-primary">Attendance Admin</p>
          <h1 className="text-2xl font-black text-foreground">Quản lý điểm chấm công</h1>
          <p className="text-sm text-muted-foreground">Quản lý điểm GPS, mạng văn phòng và lịch sử chấm công.</p>
        </div>
        <div className="flex gap-2">
          <SummaryCard label="Tổng điểm" value={locations.length} />
          <SummaryCard label="Đang bật" value={activeCount} />
        </div>
      </div>

      {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div>}

      <div className={`grid gap-4 ${canManage ? 'xl:grid-cols-[0.8fr_1.2fr]' : ''}`}>
        {canManage && <section className="rounded-3xl border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Plus size={22} /></div><div><h2 className="text-lg font-black">{editing ? 'Sửa điểm' : 'Thêm điểm mới'}</h2><p className="text-sm text-muted-foreground">Chọn cách xác thực cho từng điểm chấm công.</p></div></div>
          <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); void submitForm(); }}>
            <Input label="Tên điểm" value={form.name} onChange={(value) => setForm((prev) => ({ ...prev, name: value }))} />
            <Input label="Địa chỉ" value={form.address} onChange={(value) => setForm((prev) => ({ ...prev, address: value }))} />
            <label className="grid gap-1 text-sm font-bold">Cách chấm công
              <select disabled={locating || detectingIp || submitting} value={form.verification_method} onChange={(event) => setForm((prev) => ({ ...prev, verification_method: event.target.value as AttendanceMethod }))} className="h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold">
                <option value="gps">Vị trí GPS</option><option value="ip">Mạng văn phòng (IP)</option>
              </select>
            </label>
            {form.verification_method === 'ip' ? <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">Kết nối Wi-Fi hoặc mạng dây của văn phòng rồi lấy IP. Khi IP Internet thay đổi, sửa điểm này, lấy lại IP và bấm Lưu.</p>
              <button type="button" disabled={detectingIp || submitting} onClick={() => void captureCurrentIp()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-white px-4 text-sm font-bold text-primary hover:bg-primary/10 disabled:opacity-50">
                {detectingIp ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Wifi size={18} aria-hidden="true" />}{detectingIp ? 'Đang lấy IP...' : 'Lấy IP mạng hiện tại'}
              </button>
              <label className="grid gap-1 text-sm font-bold">IP public được phép
                <textarea rows={3} value={form.allowed_ips} onChange={(event) => setForm((prev) => ({ ...prev, allowed_ips: event.target.value }))} placeholder="Mỗi IP một dòng" spellCheck={false} className="w-full rounded-xl border border-border bg-white px-3 py-2 font-mono text-sm font-medium outline-none focus:border-primary" />
              </label>
              <p className="text-xs text-muted-foreground">Nút lấy IP thay thế danh sách hiện tại; chỉ đăng ký mạng văn phòng. Với IPv6, mỗi thiết bị có thể có IP khác nhau: chỉ nhập dải mạng khi đã được quản trị mạng xác nhận.</p>
            </div> : <>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" disabled={locating} onClick={() => void captureCurrentLocation()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 text-sm font-black text-primary hover:bg-primary/10 disabled:opacity-50">{locating ? <Loader2 className="animate-spin" size={18} /> : <Crosshair size={18} />} Lấy vị trí hiện tại</button>
              <div className="flex min-h-11 items-center rounded-xl border border-border bg-slate-50 px-3 text-sm font-semibold text-muted-foreground">{form.latitude && form.longitude ? 'Đã lấy vị trí GPS' : 'Chưa lấy vị trí GPS'}</div>
            </div>
            <label className="grid gap-2 text-sm font-bold text-foreground">Bán kính: {form.radius_meters}m<input type="range" min="50" max="500" step="10" value={form.radius_meters} onChange={(event) => setForm((prev) => ({ ...prev, radius_meters: event.target.value }))} /></label>
            </>}
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))} /> Đang hoạt động</label>
            <div className="flex gap-2">
              <button type="submit" disabled={submitting || locating || detectingIp} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-white hover:bg-primary/90 disabled:opacity-50">{submitting ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />} Lưu</button>
              {editing && <button type="button" disabled={submitting || locating || detectingIp} onClick={resetForm} className="h-11 rounded-xl border border-border px-4 text-sm font-bold hover:bg-muted">Hủy</button>}
            </div>
          </form>
        </section>}

        <section className="rounded-3xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="border-b border-border px-5 py-4"><h2 className="text-lg font-black">Danh sách điểm</h2></div>
          <div className="overflow-auto">
            <table className="hidden w-full min-w-[700px] text-left text-sm md:table">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted-foreground"><tr>{['Tên', 'Xác thực', 'Trạng thái', 'Hành động'].map((h) => <th key={h} className="px-4 py-3 font-black">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">{locations.map((location) => <LocationRow key={location.id} location={location} canManage={canManage} onEdit={openEdit} onToggle={toggleLocation} onDelete={deleteLocation} />)}</tbody>
            </table>
            <div className="grid gap-3 p-3 md:hidden">{locations.map((location) => <div key={location.id} className="min-w-0 rounded-2xl border border-border p-3">
              <p className="font-bold">{location.name}</p><p className="text-xs text-muted-foreground">{location.address || 'Chưa có địa chỉ'}</p>
              <p className="mt-2 break-all text-sm">{location.verification_method === 'ip' ? `Mạng văn phòng · ${(location.allowed_ips ?? []).join(', ')}` : `GPS · ${location.radius_meters}m`}</p>
              <p className="mt-1 text-xs text-muted-foreground">{location.is_active ? 'Đang bật' : 'Tạm tắt'}</p>
              {canManage && <button type="button" disabled={detectingIp || locating || submitting} onClick={() => openEdit(location)} className="mt-2 min-h-11 rounded-xl border border-border px-3 text-sm font-bold">Sửa điểm</button>}
            </div>)}</div>
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
          <table className="hidden w-full min-w-[1040px] text-left text-sm md:table">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted-foreground"><tr>{['Thời gian', 'Nhân viên', 'Loại', 'Địa điểm', 'Khoảng cách', 'Xác thực / IP', 'Trạng thái', 'Lý do'].map((h) => <th key={h} className="px-4 py-3 font-black">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">{logs.map((log) => <LogRow key={log.id} log={log} />)}</tbody>
          </table>
          <div className="grid gap-3 p-3 md:hidden">{logs.map((log) => <article key={log.id} className="min-w-0 rounded-2xl border border-border p-3 text-sm">
            <div className="flex items-start justify-between gap-2"><p className="font-bold">{log.user?.full_name || log.user?.username || 'Nhân viên'}</p><span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${log.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{log.status === 'success' ? 'Thành công' : 'Thất bại'}</span></div>
            <p className="mt-1 text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString('vi-VN')} · {log.type === 'check_in' ? 'Check-in' : 'Check-out'}</p>
            <p className="mt-2">{log.location?.name ?? 'Chưa xác thực điểm'} · {log.verification_method === 'ip' ? 'Mạng văn phòng' : 'GPS'}</p>
            <p className="mt-1 break-all font-mono text-xs">IP: {log.source_ip ?? '—'}</p>
            {log.failure_reason && <p className="mt-1 break-words text-xs text-red-600">{log.failure_reason}</p>}
          </article>)}</div>
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

function LocationRow({ location, canManage, onEdit, onToggle, onDelete }: { location: AttendanceLocation; canManage: boolean; onEdit: (location: AttendanceLocation) => void; onToggle: (location: AttendanceLocation) => void; onDelete: (location: AttendanceLocation) => void }) {
  return <tr className="hover:bg-muted/40"><td className="px-4 py-3"><p className="font-black">{location.name}</p><p className="text-xs text-muted-foreground">{location.address || 'Chưa có địa chỉ'}</p></td><td className="px-4 py-3">{location.verification_method === 'ip' ? <><p className="font-semibold">Mạng văn phòng</p><p className="max-w-64 break-all font-mono text-xs text-muted-foreground">{(location.allowed_ips ?? []).join(', ')}</p></> : `GPS · ${location.radius_meters}m`}</td><td className="px-4 py-3"><button type="button" disabled={!canManage} onClick={() => void onToggle(location)} className={`rounded-full px-3 py-1 text-xs font-black ${location.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{location.is_active ? 'Đang bật' : 'Tạm tắt'}</button></td><td className="px-4 py-3">{canManage && <div className="flex gap-2"><button type="button" aria-label={`Sửa điểm ${location.name}`} onClick={() => onEdit(location)} className="rounded-lg border border-border p-2 hover:bg-muted"><Edit3 size={16} /></button><button type="button" aria-label={`Xóa điểm ${location.name}`} onClick={() => void onDelete(location)} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"><Trash2 size={16} /></button></div>}</td></tr>;
}

function LogRow({ log }: { log: AttendanceLog }) {
  return <tr className="hover:bg-muted/40"><td className="px-4 py-3 font-semibold">{new Date(log.created_at).toLocaleString('vi-VN')}</td><td className="px-4 py-3">{log.user?.full_name || log.user?.username || log.user?.id || '—'}</td><td className="px-4 py-3">{log.type === 'check_in' ? 'Check-in' : 'Check-out'}</td><td className="px-4 py-3">{log.location?.name ?? '—'}</td><td className="px-4 py-3">{log.distance_meters == null ? '—' : `${Math.round(log.distance_meters)}m`}</td><td className="px-4 py-3"><p>{log.verification_method === 'ip' ? 'Mạng văn phòng' : log.accuracy == null ? '—' : `GPS ±${Math.round(log.accuracy)}m`}{log.accuracy_warning ? ' · cảnh báo' : ''}</p><p className="max-w-52 break-all font-mono text-xs text-muted-foreground">{log.source_ip ?? '—'}</p></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${log.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{log.status === 'success' ? 'Thành công' : 'Thất bại'}</span></td><td className="px-4 py-3 text-xs text-muted-foreground">{log.failure_reason ?? '—'}</td></tr>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex items-center justify-center gap-2 p-6 text-sm font-semibold text-muted-foreground"><MapPin size={18} />{text}</div>;
}
