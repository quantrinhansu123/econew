import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Loader2, Printer } from 'lucide-react';
import { ApiError, apiRequest } from '../../lib/api';
import { getStoredAuthUser } from '../../lib/authUser';
import type { CustomerListItem, CustomerListResponse } from '../warehouse/customers/types';
import type { WaybillDetail } from '../warehouse/orders/types';
import WaybillInvoiceTemplate from './WaybillInvoiceTemplate';
import { customerAddress, customerPhone } from '../warehouse/customers/customerOrderPatch';
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

export default function PrintWaybillPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const preview = searchParams.get('preview') === '1';
  const autoPrint = searchParams.get('print') === '1';
  const printFormat = resolveWaybillPrintFormat(searchParams.get('format'));
  const roleMask = getStoredAuthUser()?.role_mask;
  const canViewPricing = canViewWaybillPricing(roleMask);
  const showPricing = shouldShowWaybillPricing(roleMask, searchParams.get('pricing'));
  const pageSizeRule = buildWaybillPageSizeRule(printFormat);

  const updateSearchParams = (next: URLSearchParams) => {
    const query = next.toString();
    navigate({ pathname: `/print/waybill/${id}`, search: query ? `?${query}` : '' }, { replace: true });
  };

  const setPrintFormat = (format: WaybillPrintFormat) => {
    updateSearchParams(withWaybillPrintFormat(searchParams, format));
  };

  const setShowPricing = (checked: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (canViewPricing && checked) next.set('pricing', 'show');
    else next.delete('pricing');
    updateSearchParams(next);
  };

  const [waybill, setWaybill] = useState<WaybillDetail | null>(null);
  const [customer, setCustomer] = useState<CustomerListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    const loadTimer = window.setTimeout(() => {
      setLoading(true);
      apiRequest<WaybillDetail>(`/waybills/${id}`)
        .then(async (data) => {
          if (!mounted) return;
          setWaybill(data);
          const note = data.note || data.notes || '';
          const maKhMatch = note.match(/ma_kh=([^|]+)/);
          const maKh = maKhMatch?.[1]?.trim();
          if (maKh) {
            try {
              const res = await apiRequest<CustomerListResponse>(
                `/customers?keyword=${encodeURIComponent(maKh)}&limit=5`,
              );
              const items = Array.isArray(res) ? res : res.items || [];
              const match = items.find((c) => c.code.toUpperCase() === maKh.toUpperCase());
              if (mounted && match) setCustomer(match);
            } catch {
              /* optional */
            }
          }
        })
        .catch((err: unknown) => {
          if (!mounted) return;
          setError(err instanceof ApiError ? err.message : 'Không tải được vận đơn.');
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    }, 0);

    return () => {
      mounted = false;
      window.clearTimeout(loadTimer);
    };
  }, [id]);

  useEffect(() => {
    if (!autoPrint || loading || error || !waybill) return;
    const timer = window.setTimeout(() => {
      void printWaybillWhenReady();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [autoPrint, loading, error, waybill]);

  const printData = useMemo(() => {
    if (!waybill) return null;
    const base = buildWaybillPrintData(waybill, showPricing);
    if (!customer) return base;
    const phone = customerPhone(customer);
    const address = customerAddress(customer);
    return {
      ...base,
      maKhGui: customer.code,
      tenKhGui: customer.name,
      diaChiGui: address || base.diaChiGui,
      sdtGui: phone || base.sdtGui,
      dichVu: customer.price_table?.toUpperCase().includes('BỘ') ? 'ĐƯỜNG BỘ' : base.dichVu,
    };
  }, [waybill, customer, showPricing]);

  const wrapClassName = `waybill-invoice-wrap waybill-invoice-wrap--${printFormat}`;

  return (
    <div className={wrapClassName}>
      <style>{pageSizeRule}</style>
      <div className="print-toolbar mb-4 flex w-full max-w-[297mm] flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[13px] font-bold"
        >
          <ArrowLeft size={15} />
          Quay lại
        </button>
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
          disabled={!printData}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-bold text-white disabled:opacity-50"
        >
          <Printer size={15} />
          In phiếu
        </button>
        {preview && (
          <span className="text-[12px] text-muted-foreground">Chế độ xem trước — kiểm tra nội dung trước khi in.</span>
        )}
        <span className="w-full text-[12px] text-muted-foreground">
          {WAYBILL_PRINT_FORMAT_CONFIG[printFormat].hint}
        </span>
        <span className="text-[12px] text-muted-foreground">
          {showPricing
            ? 'Phiếu đang hiển thị cước phí.'
            : canViewPricing
              ? 'Cước phí đang ẩn — bật “Hiện cước khi in” tại màn hình nhập đơn nếu cần.'
              : 'Cước phí ẩn theo phân quyền.'}
        </span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-20 text-[13px] font-bold text-muted-foreground">
          <Loader2 className="animate-spin" size={20} />
          Đang tải phiếu in...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-bold text-red-700">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      {printData ? (
        <div className={`waybill-paper-preview waybill-paper-preview--${printFormat}`}>
          <WaybillInvoiceTemplate data={printData} />
        </div>
      ) : null}
    </div>
  );
}
