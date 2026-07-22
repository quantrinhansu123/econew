import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Loader2, Printer } from 'lucide-react';
import { ApiError, apiRequest } from '../../lib/api';
import { getStoredAuthUser } from '../../lib/authUser';
import type { WaybillDetail } from '../warehouse/orders/types';
import WaybillInvoiceTemplate from './WaybillInvoiceTemplate';
import { buildWaybillPrintData, printWaybillWhenReady } from './waybillPrintUtils';
import { canViewWaybillPricing, shouldShowWaybillPricing } from './waybillPricingAccess';
import {
  buildWaybillPageSizeRule,
  resolveWaybillPrintFormat,
  WAYBILL_PRINT_FORMAT_CONFIG,
  WAYBILL_PRINT_FORMATS,
  withWaybillPrintFormat,
  type WaybillPrintFormat,
} from './waybillPrintFormat';
import './waybill-invoice.css';

export default function PrintWaybillsBulkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const idsParam = searchParams.get('ids') || '';
  const ids = useMemo(
    () => idsParam.split(',').map((id) => id.trim()).filter(Boolean),
    [idsParam],
  );
  const autoPrint = searchParams.get('print') === '1';
  const roleMask = getStoredAuthUser()?.role_mask;
  const canViewPricing = canViewWaybillPricing(roleMask);
  const showPricing = shouldShowWaybillPricing(roleMask, searchParams.get('pricing'));
  const printFormat = resolveWaybillPrintFormat(searchParams.get('format'));
  const pageSizeRule = buildWaybillPageSizeRule(printFormat);

  const setPrintFormat = (format: WaybillPrintFormat) => {
    setSearchParams(withWaybillPrintFormat(searchParams, format), { replace: true });
  };

  const setShowPricing = (checked: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (canViewPricing && checked) next.set('pricing', 'show');
    else next.delete('pricing');
    setSearchParams(next, { replace: true });
  };

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
    () => waybills.map((waybill) => buildWaybillPrintData(waybill, showPricing)),
    [waybills, showPricing],
  );
  const displayError = ids.length ? error : 'Chưa chọn vận đơn để in.';

  return (
    <div className={`waybill-invoice-wrap waybill-invoice-wrap--${printFormat}`}>
      <style>{pageSizeRule}</style>
      <div className="print-toolbar mb-4 flex w-full max-w-[297mm] flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-white p-1">
          {WAYBILL_PRINT_FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => setPrintFormat(format)}
              aria-pressed={printFormat === format}
              className={`inline-flex h-8 items-center rounded-md px-2.5 text-[12px] font-bold transition-colors ${
                printFormat === format
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {WAYBILL_PRINT_FORMAT_CONFIG[format].label}
            </button>
          ))}
        </div>
        {canViewPricing && (
          <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[12px] font-bold text-slate-700">
            <input
              type="checkbox"
              checked={showPricing}
              onChange={(event) => setShowPricing(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            />
            Hiện cước khi in
          </label>
        )}
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
          {printItems.length} phiếu · mỗi đơn đúng một trang {WAYBILL_PRINT_FORMAT_CONFIG[printFormat].pageLabel}.
        </span>
        <span className="w-full text-[12px] text-muted-foreground">
          {WAYBILL_PRINT_FORMAT_CONFIG[printFormat].hint}
        </span>
        <span className="text-[12px] text-muted-foreground">
          {showPricing
            ? 'Phiếu đang hiển thị cước phí.'
            : canViewPricing
              ? 'Cước phí đang ẩn.'
              : 'Cước phí ẩn theo phân quyền.'}
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
            <div className={`waybill-paper-preview waybill-paper-preview--${printFormat}`}>
              <WaybillInvoiceTemplate data={data} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
