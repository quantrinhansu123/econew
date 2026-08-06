import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Loader2, Printer } from 'lucide-react';
import { ApiError, apiRequest } from '../../lib/api';
import { getStoredAuthUser } from '../../lib/authUser';
import type { CustomerListItem, CustomerListResponse } from '../warehouse/customers/types';
import type { WaybillDetail } from '../warehouse/orders/types';
import WaybillInvoiceTemplate from './WaybillInvoiceTemplate';
import { buildWaybillPrintData, printWaybillWhenReady } from './waybillPrintUtils';
import { canViewWaybillPricing, shouldShowWaybillPricing } from './waybillPricingAccess';
import { mergeCustomerIntoPrintData } from './customerPrintData';
import './waybill-invoice.css';

export default function PrintWaybillPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const preview = searchParams.get('preview') === '1';
  const autoPrint = searchParams.get('print') === '1';
  const roleMask = getStoredAuthUser()?.role_mask;
  const canViewPricing = canViewWaybillPricing(roleMask);
  const showPricing = shouldShowWaybillPricing(roleMask, searchParams.get('pricing'));
  const pageSizeRule = '@media print { @page { size: A4 portrait; margin: 5mm; } }';

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
    return mergeCustomerIntoPrintData(base, customer);
  }, [waybill, customer, showPricing]);

  return (
    <div className="waybill-invoice-wrap waybill-invoice-wrap--a4">
      <style>{pageSizeRule}</style>
      <div className="print-toolbar mb-4 flex w-full max-w-[210mm] flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[13px] font-bold"
        >
          <ArrowLeft size={15} />
          Quay lại
        </button>
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
          In trên giấy A4 dọc như bình thường, không cần chỉnh khay; phiếu nằm ở nửa trên trang.
        </span>
        <span className="w-full text-[12px] font-semibold text-amber-700">
          Máy Canon LBP3050 nếu in ra giấy trắng: trong cửa sổ in nhấn Ctrl+Shift+P, chọn Canon rồi bấm In.
        </span>
        <span className="text-[12px] text-muted-foreground">
          {printData?.showPricing
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
        <div className="waybill-paper-preview waybill-paper-preview--a4">
          <WaybillInvoiceTemplate data={printData} />
        </div>
      ) : null}
    </div>
  );
}
