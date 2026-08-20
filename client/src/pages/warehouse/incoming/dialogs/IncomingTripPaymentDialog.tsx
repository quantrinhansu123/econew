import { Banknote, ImagePlus, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import CashFundSelect from '../../../../components/finance/CashFundSelect';
import {
  formatAmountInput,
  formatAmountInputFromNumber,
  parseAmountInput,
} from '../../../../lib/formatMoney';
import type { IncomingTrip } from '../types';
import { defaultExpenseCategoryNames, loadExpenseCategoryNames } from '../../../../lib/expenseCategories';
import {
  formatCollectAmount,
  getManifestCode,
  getPaymentNote,
  getPlateLabel,
  getTotalCollect,
  getVendorName,
  normalizeVendorPaymentStatus,
  vendorPaymentStatusOptions,
  type IncomingVendorPaymentStatus,
} from '../incomingTripUtils';

export function IncomingTripPaymentDialog({
  trip,
  isSubmitting,
  error,
  onClose,
  onConfirm,
}: {
  trip: IncomingTrip | null;
  isSubmitting: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (payload: {
    payment_status: IncomingVendorPaymentStatus;
    paid_amount?: number;
    fund_id?: string;
    cost_category?: string;
    proofFile?: File;
    payment_note?: string;
  }) => void;
}) {
  const [paymentStatus, setPaymentStatus] = useState<IncomingVendorPaymentStatus>('UNPAID');
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [fundId, setFundId] = useState('');
  const [costCategories, setCostCategories] = useState<string[]>(defaultExpenseCategoryNames);
  const [costCategory, setCostCategory] = useState(defaultExpenseCategoryNames[0]);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!trip) return;
    setPaymentStatus(normalizeVendorPaymentStatus(trip.vendor_payment_status));
    setPaidAmount(formatAmountInputFromNumber(trip.vendor_paid_amount));
    setPaymentNote(getPaymentNote(trip));
    setFundId('');
    setCostCategory((current) => costCategories.includes(current) ? current : costCategories[0] || '');
    setProofFile(null);
    setProofPreview(trip.vendor_payment_proof_url?.trim() || '');
    setLocalError('');
  }, [costCategories, trip]);

  useEffect(() => {
    void loadExpenseCategoryNames().then(setCostCategories).catch(() => undefined);
  }, []);

  if (!trip) return null;

  const handleProofChange = (file: File | null) => {
    if (!file) {
      setProofFile(null);
      setProofPreview(trip.vendor_payment_proof_url?.trim() || '');
      setLocalError('');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setLocalError('Chỉ chấp nhận file ảnh.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLocalError('Ảnh tối đa 5 MB.');
      return;
    }
    setProofFile(file);
    setProofPreview(URL.createObjectURL(file));
    setLocalError('');
  };

  const handleSubmit = () => {
    setLocalError('');
    const note = paymentNote.trim();
    if (paymentStatus === 'PARTIAL') {
      const amount = parseAmountInput(paidAmount);
      if (!paidAmount.trim() || amount <= 0) {
        setLocalError('Đề xuất thanh toán phải nhập số tiền lớn hơn 0.');
        return;
      }
      if (!fundId) {
        setLocalError('Vui lòng chọn sổ quỹ chi tiền.');
        return;
      }
      onConfirm({ payment_status: paymentStatus, paid_amount: amount, fund_id: fundId, cost_category: costCategory, payment_note: note });
      return;
    }
    if (paymentStatus === 'PAID') {
      const amount = parseAmountInput(paidAmount);
      if (!paidAmount.trim() || amount <= 0) {
        setLocalError('Đã thanh toán phải nhập số tiền lớn hơn 0.');
        return;
      }
      if (!proofFile && !trip.vendor_payment_proof_url?.trim()) {
        setLocalError('Đã thanh toán phải upload ảnh chứng từ.');
        return;
      }
      if (!fundId) {
        setLocalError('Vui lòng chọn sổ quỹ chi tiền.');
        return;
      }
      onConfirm({
        payment_status: paymentStatus,
        paid_amount: amount,
        fund_id: fundId,
        cost_category: costCategory,
        proofFile: proofFile ?? undefined,
        payment_note: note,
      });
      return;
    }
    onConfirm({ payment_status: paymentStatus, payment_note: note });
  };

  const displayError = localError || error;
  const needsAmount = paymentStatus === 'PARTIAL' || paymentStatus === 'PAID';
  const needsProof = paymentStatus === 'PAID';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-700">Thanh toán NCC</p>
            <h2 className="text-[15px] font-black text-foreground">{getManifestCode(trip)} · {getPlateLabel(trip)}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4 text-[13px]">
          <div className="rounded-xl border border-border bg-muted/10 px-3 py-2">
            <p className="text-[11px] font-bold text-muted-foreground">Nhà cung cấp</p>
            <p className="font-extrabold text-foreground">{getVendorName(trip)}</p>
            <p className="mt-2 text-[11px] font-bold text-muted-foreground">Lái xe đã thu trên xe</p>
            <p className="font-extrabold text-emerald-700 tabular-nums">{formatCollectAmount(getTotalCollect(trip))}</p>
          </div>
          <label className="block space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Trạng thái thanh toán</span>
            <select
              value={paymentStatus}
              onChange={(event) => {
                setPaymentStatus(event.target.value as IncomingVendorPaymentStatus);
                setLocalError('');
              }}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-bold outline-none focus:border-primary"
            >
              {vendorPaymentStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {needsAmount && (
            <label className="block space-y-1">
              <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                Bồi P trả (số tiền đã chi) {paymentStatus === 'PAID' ? '(bắt buộc)' : ''}
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={paidAmount}
                onChange={(event) => setPaidAmount(formatAmountInput(event.target.value))}
                placeholder="Nhập số tiền (vd: 1.500.000)"
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-bold tabular-nums outline-none focus:border-primary"
              />
            </label>
          )}
          {needsAmount && <CashFundSelect value={fundId} onChange={(value) => { setFundId(value); setLocalError(''); }} label="Sổ quỹ chi tiền" />}
          {needsAmount && (
            <label className="block space-y-1">
              <span className="text-[11px] font-extrabold uppercase text-muted-foreground">Loại chi phí</span>
              <select value={costCategory} onChange={(event) => setCostCategory(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-bold outline-none focus:border-primary">
                {costCategories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-red-600">Ghi chú</span>
            <textarea
              value={paymentNote}
              onChange={(event) => setPaymentNote(event.target.value)}
              placeholder="VD: C Thắm đã CK 20 triệu ngày 26/03"
              rows={3}
              maxLength={500}
              className="w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-[13px] font-medium outline-none focus:border-primary"
            />
          </label>
          {needsProof && (
            <div className="space-y-1">
              <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Ảnh chứng từ (bắt buộc)</span>
              <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-muted/10 px-3 py-2.5 hover:bg-muted/20">
                <span className="text-[12px] font-semibold text-muted-foreground">
                  {proofFile?.name || (trip.vendor_payment_proof_url ? 'Chọn ảnh mới...' : 'Chọn ảnh từ máy...')}
                </span>
                <ImagePlus size={16} className="shrink-0 text-emerald-700" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => handleProofChange(event.target.files?.[0] ?? null)}
                />
              </label>
              {proofPreview && (
                <img src={proofPreview} alt="Xem trước chứng từ" className="max-h-40 rounded-lg border border-border object-contain" />
              )}
              <p className="text-[11px] text-muted-foreground">Ảnh sẽ được lưu lên cloud (Supabase).</p>
            </div>
          )}
          {displayError && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">{displayError}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="h-9 rounded-lg border border-border px-3 text-[12px] font-bold text-muted-foreground hover:bg-muted disabled:opacity-50">
            Hủy
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-[12px] font-extrabold text-white disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Banknote size={14} />}
            Lưu thanh toán
          </button>
        </div>
      </div>
    </div>
  );
}
