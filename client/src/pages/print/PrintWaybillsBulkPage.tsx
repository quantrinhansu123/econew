import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Loader2, Printer } from 'lucide-react';
import { ApiError, apiRequest } from '../../lib/api';
import type { WaybillDetail } from '../warehouse/orders/types';
import WaybillInvoiceTemplate from './WaybillInvoiceTemplate';
import { buildWaybillPrintData, printWaybillWhenReady } from './waybillPrintUtils';
import './waybill-invoice.css';

export default function PrintWaybillsBulkPage() {
  const [searchParams] = useSearchParams();
  const ids = useMemo(
    () => searchParams.get('ids')?.split(',').map((id) => id.trim()).filter(Boolean) ?? [],
    [searchParams],
  );
  const autoPrint = searchParams.get('print') === '1';

  const [waybills, setWaybills] = useState<WaybillDetail[]>([]);
  const [loading, setLoading] = useState(ids.length > 0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ids.length) return;

    let mounted = true;
    const loadTimer = window.setTimeout(() => {
      setLoading(true);
      setError('');

      void Promise.all(ids.map((id) => apiRequest<WaybillDetail>(`/waybills/${id}`)))
        .then((items) => {
          if (!mounted) return;
          setWaybills(items);
        })
        .catch((err: unknown) => {
          if (!mounted) return;
          setWaybills([]);
          setError(err instanceof ApiError ? err.message : 'Không tải được danh sách vận đơn.');
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    }, 0);

    return () => {
      mounted = false;
      window.clearTimeout(loadTimer);
    };
  }, [ids]);

  useEffect(() => {
    if (!autoPrint || loading || error || !waybills.length) return;
    const timer = window.setTimeout(() => {
      void printWaybillWhenReady();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [autoPrint, loading, error, waybills.length]);

  const printItems = useMemo(
    () => waybills.map((waybill) => buildWaybillPrintData(waybill)),
    [waybills],
  );
  const displayError = ids.length ? error : 'Chưa chọn vận đơn để in.';

  return (
    <div className="waybill-invoice-wrap">
      <div className="print-toolbar mb-4 flex w-full max-w-[210mm] flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void printWaybillWhenReady()}
          disabled={!printItems.length}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-bold text-white disabled:opacity-50"
        >
          <Printer size={15} />
          In {printItems.length} phiếu
        </button>
        <span className="text-[12px] text-muted-foreground">
          {printItems.length} phiếu A5 ngang · mỗi đơn in trên một trang.
        </span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-20 text-[13px] font-bold text-muted-foreground">
          <Loader2 className="animate-spin" size={20} />
          Đang tải phiếu in...
        </div>
      )}

      {displayError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-bold text-red-700">
          <AlertTriangle size={18} />
          {displayError}
        </div>
      )}

      <div className="waybill-bulk-print-stack">
        {printItems.map((data) => (
          <div key={data.waybillCode} className="waybill-bulk-print-item">
            <div className="waybill-paper-preview waybill-paper-preview--a5">
              <WaybillInvoiceTemplate data={data} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
