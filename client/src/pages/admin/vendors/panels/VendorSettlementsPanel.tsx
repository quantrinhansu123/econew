import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Plus } from 'lucide-react';
import { ApiError, apiRequest } from '../../../../lib/api';
import { formatAmountInput, formatAmountInputFromNumber, formatMoney, parseAmountInput } from '../../../../lib/formatMoney';
import { settlementLabel, settlementToday, type SettlementRange, type UnallocatedVendorPayment, type VendorSettlement } from '../settlementTypes';

interface Props {
  vendorId: string;
  initialRange?: SettlementRange;
  revision: number;
  onSpend: (period: VendorSettlement) => void;
  onChanged: () => Promise<void>;
}

const fieldClass = 'h-10 w-full min-w-0 rounded-xl border border-border bg-white px-3 text-[13px] font-semibold outline-none focus:ring-2 focus:ring-primary/15';
const labels = { UNPAID: 'Chờ TT', PARTIAL: 'TT một phần', PAID: 'Đã TT' };
const errorText = (error: unknown) => error instanceof ApiError ? error.message : 'Không cập nhật được công nợ kỳ.';

export default function VendorSettlementsPanel({ vendorId, initialRange, revision, onSpend, onChanged }: Props) {
  const [range, setRange] = useState<SettlementRange>(() => ({
    fromDate: initialRange?.fromDate || `${settlementToday().slice(0, 7)}-01`, toDate: initialRange?.toDate || settlementToday(),
  }));
  const [periods, setPeriods] = useState<VendorSettlement[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [payments, setPayments] = useState<UnallocatedVendorPayment[]>([]);
  const [paymentId, setPaymentId] = useState('');
  const [amount, setAmount] = useState('');
  const [preview, setPreview] = useState<{ trip_count: number; total_amount: number; paid_amount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewError, setPreviewError] = useState('');
  const selected = periods.find((period) => period.id === selectedId);
  const selectedPayment = payments.find((payment) => payment.id === paymentId);
  const overlappingPeriod = periods.find((period) => period.from_date <= range.toDate && period.to_date >= range.fromDate);
  const initialFrom = initialRange?.fromDate;
  const initialTo = initialRange?.toDate;

  const load = useCallback(async (signal?: AbortSignal) => {
    const [periodResponse, paymentResponse] = await Promise.all([
      apiRequest<{ items: VendorSettlement[] }>(`/vendors/${vendorId}/settlements`, { signal }),
      apiRequest<{ items: UnallocatedVendorPayment[] }>(`/vendors/${vendorId}/settlements/unallocated-payments`, { signal }),
    ]);
    if (signal?.aborted) return;
    setPeriods(periodResponse.items);
    setPayments(paymentResponse.items);
    setSelectedId((previous) => periodResponse.items.some((period) => period.id === previous) ? previous
      : periodResponse.items.find((period) => period.from_date === initialFrom && period.to_date === initialTo)?.id || periodResponse.items[0]?.id || '');
  }, [vendorId, initialFrom, initialTo]);

  useEffect(() => {
    const abort = new AbortController();
    const timeout = setTimeout(() => {
      void load(abort.signal).catch((err) => { if (!abort.signal.aborted) setError(errorText(err)); })
        .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    }, 0);
    return () => { clearTimeout(timeout); abort.abort(); };
  }, [load, revision]);

  useEffect(() => {
    const abort = new AbortController();
    const timeout = setTimeout(() => {
      setPreview(null);
      setPreviewError('');
      if (!range.fromDate || !range.toDate || range.fromDate > range.toDate) return;
      const query = new URLSearchParams({ from_date: range.fromDate, to_date: range.toDate });
      void apiRequest<{ trip_count: number; total_amount: number; paid_amount: number }>(`/vendors/${vendorId}/settlements/preview?${query}`, { signal: abort.signal })
        .then((result) => { if (!abort.signal.aborted) setPreview(result); })
        .catch((err) => { if (!abort.signal.aborted) setPreviewError(errorText(err)); });
    }, 300);
    return () => { clearTimeout(timeout); abort.abort(); };
  }, [vendorId, range.fromDate, range.toDate, revision]);

  const createPeriod = async () => {
    setBusy(true); setError('');
    try {
      const created = await apiRequest<{ id: string }>(`/vendors/${vendorId}/settlements`, {
        method: 'POST', body: { from_date: range.fromDate, to_date: range.toDate, expected_total: preview?.total_amount, expected_trip_count: preview?.trip_count },
      });
      await load();
      setSelectedId(created.id);
      await onChanged();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };

  const attach = async () => {
    if (!selected || !selectedPayment) return;
    const value = parseAmountInput(amount);
    if (value <= 0 || value > selectedPayment.available_amount || value > selected.remaining_amount) {
      setError('Số tiền phải lớn hơn 0 và không vượt phần chưa phân bổ hoặc công nợ còn lại.'); return;
    }
    setBusy(true); setError('');
    try {
      await apiRequest(`/vendors/${vendorId}/settlements/${selected.id}/payments/${paymentId}/allocate`, { method: 'POST', body: { amount: value } });
      setPaymentId(''); setAmount('');
      await load(); await onChanged();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-white p-4 shadow-sm" aria-label="Thanh toán công nợ theo kỳ">
      <div>
        <h3 className="text-[12px] font-extrabold uppercase tracking-wide text-primary">Chốt công nợ theo kỳ</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">Theo ngày khởi hành, gồm các chuyến đã khởi hành. Nợ đầu kỳ và phí khác theo dõi riêng ở sổ NCC.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-[12px] font-bold">Từ ngày<input type="date" className={fieldClass} value={range.fromDate} onChange={(event) => { setRange((prev) => ({ ...prev, fromDate: event.target.value })); setPreview(null); }} /></label>
        <label className="space-y-1 text-[12px] font-bold">Đến ngày<input type="date" className={fieldClass} value={range.toDate} onChange={(event) => { setRange((prev) => ({ ...prev, toDate: event.target.value })); setPreview(null); }} /></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
        <div className="text-[12px]" aria-live="polite">
          {preview ? <><b>{preview.trip_count} chuyến · {formatMoney(preview.total_amount)}</b><p className="mt-1 text-muted-foreground">Đã trả: {formatMoney(preview.paid_amount)} · Còn: {formatMoney(preview.total_amount - preview.paid_amount)}</p></> : 'Chọn khoảng ngày hợp lệ để xem công nợ.'}
        </div>
        <button type="button" disabled={busy || loading || Boolean(overlappingPeriod) || !preview?.trip_count} onClick={() => void createPeriod()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[12px] font-bold text-white disabled:opacity-50"><Check size={15} />{overlappingPeriod ? 'Đã có kỳ chốt' : 'Chốt kỳ'}</button>
      </div>
      <p className="text-[11px] text-muted-foreground">Sau khi chốt, danh sách chuyến và cước được giữ nguyên. Đổi bộ lọc trạng thái không làm đổi công nợ kỳ.</p>
      {overlappingPeriod && <p className="text-[11px] font-semibold text-primary">Khoảng ngày này đã có kỳ {settlementLabel(overlappingPeriod)}. Chọn kỳ bên dưới để thanh toán tiếp.</p>}
      {(error || previewError) && <p role="alert" className="text-[12px] font-semibold text-red-600">{error || previewError}</p>}
      {loading ? <Loader2 className="mx-auto animate-spin text-primary" size={22} /> : periods.length === 0 ? <p className="text-[12px] text-muted-foreground">Chưa có kỳ công nợ đã chốt.</p> : <>
        <label className="block space-y-1 text-[12px] font-bold">Kỳ thanh toán
          <select className={fieldClass} value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setPaymentId(''); setAmount(''); setError(''); }}>
            {periods.map((period) => <option key={period.id} value={period.id}>{settlementLabel(period)} · {labels[period.payment_status]}</option>)}
          </select>
        </label>
        {selected && <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-live="polite">
            {[['Đã chốt', selected.total_amount], ['Đã thanh toán', selected.paid_amount], ['Còn phải trả', selected.remaining_amount]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-border bg-slate-50 p-3"><p className="text-[11px] font-bold text-muted-foreground">{label}</p><p className="mt-1 text-[14px] font-extrabold tabular-nums">{formatMoney(Number(value))}</p></div>)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] font-bold">{selected.trips.length} chuyến · {labels[selected.payment_status]}</span>
            <button type="button" disabled={busy || selected.remaining_amount <= 0} onClick={() => onSpend(selected)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-[12px] font-bold text-white disabled:opacity-50"><Plus size={15} />Chi cho kỳ này</button>
          </div>
          <p className="text-[11px] text-muted-foreground">Mỗi lần chi cộng dồn vào kỳ này, ưu tiên chuyến cũ trước. Ngày chi có thể ở tháng khác.</p>
          <details className="rounded-xl border border-border p-3">
            <summary className="cursor-pointer text-[12px] font-bold">Chi tiết chuyến và các lần thanh toán</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[12px]"><thead><tr className="border-b border-border text-left"><th className="py-2">Chuyến</th><th className="text-right">Cước chốt</th><th className="text-right">Đã trả</th><th className="text-right">Còn lại</th></tr></thead><tbody>
                {selected.trips.map((trip) => <tr key={trip.id} className="border-b border-border/50"><td className="py-2">#{trip.id}<p className="text-[11px] text-muted-foreground">{trip.license_plate}</p></td><td className="text-right tabular-nums">{formatMoney(trip.amount)}</td><td className="text-right tabular-nums">{formatMoney(trip.paid_amount)}</td><td className="text-right tabular-nums">{formatMoney(trip.amount - trip.paid_amount)}</td></tr>)}
              </tbody></table>
            </div>
            <div className="mt-3 space-y-2 text-[12px]">
              {selected.payments.map((payment) => <div key={payment.id} className="rounded-lg bg-slate-50 p-2"><b>Phiếu #{payment.id} · {new Date(payment.payment_date).toLocaleDateString('vi-VN')} · {formatMoney(payment.amount)}</b><p className="text-muted-foreground">{payment.description}</p></div>)}
              {selected.paid_amount > selected.payments.reduce((sum, payment) => sum + payment.amount, 0) && <p className="text-muted-foreground">Có khoản đã trả ở chuyến chưa có phân bổ trong lịch sử kỳ.</p>}
            </div>
          </details>
          {selected.remaining_amount > 0 && payments.length > 0 && <details className="rounded-xl border border-border p-3">
            <summary className="cursor-pointer text-[12px] font-bold">Gắn phiếu chi cũ chưa phân bổ</summary>
            <div className="mt-3 space-y-3">
              <p className="text-[11px] text-muted-foreground">Dùng số tiền đã chi trước đây; không tạo thêm phiếu chi. Phần dư tiếp tục được giữ là chưa phân bổ.</p>
              <label className="block space-y-1 text-[12px] font-bold">Phiếu chi cũ<select aria-label="Phiếu chi cũ" className={fieldClass} value={paymentId} onChange={(event) => {
                setPaymentId(event.target.value);
                const payment = payments.find((row) => row.id === event.target.value);
                setAmount(formatAmountInputFromNumber(Math.min(payment?.available_amount || 0, selected.remaining_amount)));
              }}><option value="">Chọn phiếu chi</option>{payments.map((payment) => <option key={payment.id} value={payment.id}>#{payment.id} · {new Date(payment.payment_date).toLocaleDateString('vi-VN')} · Còn {formatMoney(payment.available_amount)}</option>)}</select></label>
              {selectedPayment && <p className="text-[12px] text-muted-foreground">Tổng phiếu chi: {formatMoney(selectedPayment.amount)} · {selectedPayment.description || 'Không có ghi chú'}</p>}
              <label className="block space-y-1 text-[12px] font-bold">Số tiền gắn vào kỳ<input type="text" inputMode="numeric" className={`${fieldClass} text-right tabular-nums`} value={amount} onChange={(event) => setAmount(formatAmountInput(event.target.value))} /></label>
              <button type="button" disabled={busy || !paymentId} onClick={() => void attach()} className="h-10 rounded-xl bg-primary px-4 text-[12px] font-bold text-white disabled:opacity-50">Gắn phiếu vào kỳ</button>
            </div>
          </details>}
        </>}
      </>}
    </section>
  );
}
