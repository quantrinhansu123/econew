import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Loader2, Printer } from 'lucide-react';
import { ApiError, apiRequest } from '../../lib/api';
import { getStoredAuthUser } from '../../lib/authUser';
import type { CustomerListItem, CustomerListResponse } from '../warehouse/customers/types';
import type { WaybillDetail } from '../warehouse/orders/types';
import WaybillInvoiceTemplate from './WaybillInvoiceTemplate';
import { customerAddress, customerPhone } from '../warehouse/customers/customerOrderPatch';
import { buildWaybillPrintData } from './waybillPrintUtils';
import './waybill-invoice.css';

const MANAGER_ROLES = 32 | 64;

type PrintFormat = 'a5' | 'standard' | 'a4-2up';

const resolvePrintFormat = (value: string | null): PrintFormat => {
  if (value === 'standard') return 'standard';
  if (value === 'a4-2up') return 'a4-2up';
  return 'a5';
};

const printFormatLabel: Record<PrintFormat, string> = {
  a5: 'A5 ngang (1 phiếu)',
  standard: 'Bill thường (A4 dọc)',
  'a4-2up': 'A4 ghép 2 phiếu A5',
};

const printFormatHint: Record<PrintFormat, string> = {
  a5: 'Khổ A5 ngang (210×148mm). Khi in: chọn A5 ngang, tắt header/footer trình duyệt.',
  standard: 'Khi in: chọn khổ A4 dọc, tắt header/footer trình duyệt.',
  'a4-2up': 'Khi in: chọn khổ A4 dọc — 1 trang in 2 phiếu A5 (liên gửi + liên nhận).',
};

export default function PrintWaybillPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const preview = searchParams.get('preview') === '1';
  const autoPrint = searchParams.get('print') === '1';
  const printFormat = resolvePrintFormat(searchParams.get('format'));
  const pricingParam = searchParams.get('pricing');

  const setPrintFormat = useCallback((format: PrintFormat) => {
    const next = new URLSearchParams(searchParams);
    if (format === 'a5') next.delete('format');
    else next.set('format', format);
    const query = next.toString();
    navigate({ pathname: `/print/waybill/${id}`, search: query ? `?${query}` : '' }, { replace: true });
  }, [id, navigate, searchParams]);

  const [waybill, setWaybill] = useState<WaybillDetail | null>(null);
  const [customer, setCustomer] = useState<CustomerListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const showPricing = useMemo(() => {
    const user = getStoredAuthUser();
    const canViewPricing = ((user?.role_mask ?? 0) & MANAGER_ROLES) !== 0;
    if (!canViewPricing) return false;
    return pricingParam !== 'hide';
  }, [pricingParam]);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
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
    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (!autoPrint || loading || error || !waybill) return;
    const timer = window.setTimeout(() => window.print(), 400);
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
      sdtNhan: phone || base.sdtNhan,
      tenKhNhan: customer.name || base.tenKhNhan,
      diaChiNhan: address || base.diaChiNhan,
      tinhGui: customer.destination_province || customer.region || base.tinhGui,
      dichVu: customer.price_table?.toUpperCase().includes('BỘ') ? 'ĐƯỜNG BỘ' : base.dichVu,
    };
  }, [waybill, customer, showPricing]);

  const wrapClassName =
    printFormat === 'standard'
      ? 'waybill-invoice-wrap waybill-invoice-wrap--standard'
      : printFormat === 'a4-2up'
        ? 'waybill-invoice-wrap waybill-invoice-wrap--a4-2up'
        : 'waybill-invoice-wrap';

  return (
    <div className={wrapClassName}>
      <div className="print-toolbar mb-4 flex w-full max-w-[210mm] flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[13px] font-bold"
        >
          <ArrowLeft size={15} />
          Quay lại
        </button>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-white p-1">
          {(['a5', 'a4-2up', 'standard'] as PrintFormat[]).map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => setPrintFormat(format)}
              className={`inline-flex h-8 items-center rounded-md px-2.5 text-[12px] font-bold transition-colors ${
                printFormat === format
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {printFormatLabel[format]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!printData}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-bold text-white disabled:opacity-50"
        >
          <Printer size={15} />
          In phiếu
        </button>
        {preview && (
          <span className="text-[12px] text-muted-foreground">Chế độ xem trước — kiểm tra nội dung trước khi in.</span>
        )}
        <span className="w-full text-[12px] text-muted-foreground">{printFormatHint[printFormat]}</span>
        {!showPricing && (
          <span className="text-[12px] text-muted-foreground">Cước phí ẩn theo quyền — chỉ in thông tin vận chuyển.</span>
        )}
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

      {printData && printFormat === 'a4-2up' ? (
        <div className="waybill-a4-sheet">
          <WaybillInvoiceTemplate data={printData} />
          <div className="waybill-a4-cut-line" aria-hidden="true" />
          <WaybillInvoiceTemplate data={printData} />
        </div>
      ) : printData ? (
        <WaybillInvoiceTemplate data={printData} />
      ) : null}
    </div>
  );
}
