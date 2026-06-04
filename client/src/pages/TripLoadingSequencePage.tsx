import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowUpDown, Loader2, Save, Truck as TruckIcon } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../lib/api';
import type { LoadingSequenceItem, LoadingSequenceResponse } from './trips/types';

const formatDate = (value?: string | null) =>
  value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';

const parsePhone = (info?: string | null) => {
  if (!info) return '—';
  const parts = info.split('|').map((p) => p.trim());
  return parts[1] || '—';
};

export default function TripLoadingSequencePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<LoadingSequenceResponse | null>(null);
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [actualWeight, setActualWeight] = useState('');
  const [actualVolume, setActualVolume] = useState('');
  const [expectedArrival, setExpectedArrival] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError('');
    try {
      const res = await apiRequest<LoadingSequenceResponse>(`/trips/${id}/loading-sequence`);
      setData(res);
      const map: Record<string, number> = {};
      res.items.forEach((item, idx) => {
        map[String(item.waybill_id)] = item.loading_position ?? idx + 1;
      });
      setPositions(map);
      setActualWeight(res.totals.actual_weight != null ? String(res.totals.actual_weight) : '');
      setActualVolume(res.totals.actual_volume != null ? String(res.totals.actual_volume) : '');
      const eta = res.trip.expected_arrival_time;
      if (eta) {
        const d = new Date(eta);
        setExpectedArrival(d.toISOString().slice(0, 16));
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tải được vị trí xếp hàng.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedItems = useMemo(() => {
    if (!data) return [];
    return [...data.items].sort((a, b) => {
      const pa = positions[String(a.waybill_id)] ?? 9999;
      const pb = positions[String(b.waybill_id)] ?? 9999;
      return pa - pb;
    });
  }, [data, positions]);

  const plannedTotals = useMemo(() => {
    if (!data) return { weight: 0, volume: 0 };
    return {
      weight: data.items.reduce((s, i) => s + Number(i.waybill?.weight ?? 0), 0),
      volume: data.items.reduce((s, i) => s + Number(i.waybill?.the_tich_m3 ?? 0), 0),
    };
  }, [data]);

  async function saveSequence() {
    if (!id || !data) return;
    setIsSaving(true);
    setMessage('');
    setError('');
    try {
      const items = Object.entries(positions).map(([waybill_id, loading_position]) => ({
        waybill_id: Number(waybill_id),
        loading_position,
      }));
      await apiRequest(`/trips/${id}/loading-sequence`, { method: 'PATCH', body: { items } });
      await apiRequest(`/trips/${id}/cargo-totals`, {
        method: 'PATCH',
        body: {
          actual_total_weight: actualWeight ? Number(actualWeight) : undefined,
          actual_total_volume: actualVolume ? Number(actualVolume) : undefined,
          expected_arrival_time: expectedArrival ? new Date(expectedArrival).toISOString() : undefined,
        },
      });
      setMessage('Đã lưu vị trí xếp hàng và chốt cân/khối.');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không lưu được.');
    } finally {
      setIsSaving(false);
    }
  }

  function moveItem(waybillId: string, direction: -1 | 1) {
    const ids = sortedItems.map((i) => String(i.waybill_id));
    const idx = ids.indexOf(waybillId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= ids.length) return;
    const next = { ...positions };
    const a = ids[idx];
    const b = ids[swapIdx];
    const tmp = next[a];
    next[a] = next[b];
    next[b] = tmp;
    setPositions(next);
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 border-b border-border shrink-0 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => navigate(-1)} className="h-10 rounded-lg border border-border px-3 text-[13px] font-medium text-muted-foreground hover:bg-muted flex items-center gap-2">
            <ArrowLeft size={15} /> Quay lại
          </button>
          <div>
            <h1 className="text-[15px] font-extrabold">Cập nhật vị trí xếp hàng</h1>
            <p className="text-[12px] text-muted-foreground">Số nhỏ = sâu trong xe (dỡ cuối). Kho HCM dùng thứ tự này để hẹn khách.</p>
          </div>
          <div className="flex-1" />
          <button
            type="button"
            disabled={isSaving || !data}
            onClick={() => void saveSequence()}
            className="h-10 rounded-lg bg-primary px-4 text-[13px] font-bold text-white hover:bg-primary/90 disabled:opacity-40 flex items-center gap-2"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Lưu tất cả
          </button>
        </div>

        {message && <div className="mx-3 mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-800">{message}</div>}
        {error && <div className="mx-3 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">{error}</div>}

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-primary"><Loader2 className="animate-spin" size={32} /></div>
        ) : !data ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">Không có dữ liệu</div>
        ) : (
          <>
            <div className="p-3 grid gap-3 md:grid-cols-4 border-b border-border bg-muted/5 text-[12px]">
              <Info label="Biển số" value={data.trip.truck?.license_plate || data.trip.truck?.bks || '—'} />
              <Info label="Lái xe" value={[data.trip.driver_name, data.trip.driver_phone].filter(Boolean).join(' · ') || '—'} />
              <Info label="Cân/Khối kế hoạch" value={`${plannedTotals.weight.toLocaleString('vi-VN')} kg · ${plannedTotals.volume.toFixed(2)} m³`} />
              <div>
                <label className="text-[11px] font-bold uppercase text-muted-foreground">Giờ dự kiến đến</label>
                <input type="datetime-local" value={expectedArrival} onChange={(e) => setExpectedArrival(e.target.value)} className="mt-1 w-full h-9 rounded-lg border border-border px-2 text-[13px]" />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
              <table className="w-full min-w-[960px] text-left border-collapse">
                <thead className="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 font-bold w-24">Vị trí</th>
                    <th className="px-3 py-2 font-bold">Mã vận đơn</th>
                    <th className="px-3 py-2 font-bold">Tỉnh đến</th>
                    <th className="px-3 py-2 font-bold">SĐT nhận</th>
                    <th className="px-3 py-2 font-bold text-right">Cân (kg)</th>
                    <th className="px-3 py-2 font-bold text-right">Khối (m³)</th>
                    <th className="px-3 py-2 font-bold w-28">Sắp xếp</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((item) => {
                    const wb = item.waybill;
                    const wid = String(item.waybill_id);
                    return (
                      <tr key={wid} className="border-b border-border hover:bg-muted/10">
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={1}
                            value={positions[wid] ?? ''}
                            onChange={(e) => setPositions((p) => ({ ...p, [wid]: Number(e.target.value) }))}
                            className="w-16 h-9 rounded-lg border border-primary/30 bg-blue-50 text-center font-extrabold text-primary text-[14px]"
                          />
                        </td>
                        <td className="px-3 py-2 font-bold text-primary">{wb?.waybill_code || wid}</td>
                        <td className="px-3 py-2 text-[13px]">{(wb as { noi_den?: string })?.noi_den || '—'}</td>
                        <td className="px-3 py-2 font-bold text-[13px]">{(wb as { receiver_phone?: string })?.receiver_phone || parsePhone(wb?.receiver_info)}</td>
                        <td className="px-3 py-2 text-right text-[13px]">{Number(wb?.weight ?? 0).toLocaleString('vi-VN')}</td>
                        <td className="px-3 py-2 text-right text-[13px]">{Number((wb as { the_tich_m3?: number })?.the_tich_m3 ?? 0).toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button type="button" title="Lên (dỡ sớm hơn)" onClick={() => moveItem(wid, -1)} className="h-8 w-8 rounded border border-border hover:bg-muted flex items-center justify-center"><ArrowUpDown size={14} className="-rotate-90" /></button>
                            <button type="button" title="Xuống (dỡ muộn hơn)" onClick={() => moveItem(wid, 1)} className="h-8 w-8 rounded border border-border hover:bg-muted flex items-center justify-center"><ArrowUpDown size={14} className="rotate-90" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-3 border-t border-border bg-card grid gap-3 md:grid-cols-3 shrink-0">
              <div>
                <label className="text-[11px] font-bold uppercase text-muted-foreground">Tổng cân thực tế (kg)</label>
                <input type="number" min={0} value={actualWeight} onChange={(e) => setActualWeight(e.target.value)} className="mt-1 w-full h-10 rounded-lg border border-border px-3 font-bold" placeholder={String(plannedTotals.weight)} />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase text-muted-foreground">Tổng khối thực tế (m³)</label>
                <input type="number" min={0} step="0.01" value={actualVolume} onChange={(e) => setActualVolume(e.target.value)} className="mt-1 w-full h-10 rounded-lg border border-border px-3 font-bold" placeholder={plannedTotals.volume.toFixed(2)} />
              </div>
              <div className="flex items-end">
                <p className="text-[12px] text-muted-foreground">
                  <TruckIcon size={14} className="inline mr-1" />
                  Chốt sau khi đóng xong — dùng cho báo cáo và kho nhận.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-bold text-foreground truncate">{value}</p>
    </div>
  );
}
