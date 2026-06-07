import { useEffect, useMemo, useState } from 'react';
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

export default function PrintWaybillPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const preview = searchParams.get('preview') === '1';
  const autoPrint = searchParams.get('print') === '1';
  const printFormat = searchParams.get('format') === 'standard' ? 'standard' : 'a5';

  const [waybill, setWaybill] = useState<WaybillDetail | null>(null);
  const [customer, setCustomer] = useState<CustomerListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const showPricing = useMemo(() => {
    const user = getStoredAuthUser();
    return ((user?.role_mask ?? 0) & MANAGER_ROLES) !== 0;
  }, []);

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

  return (
    <div className={printFormat === 'standard' ? 'waybill-invoice-wrap waybill-invoice-wrap--standard' : 'waybill-invoice-wrap'}>
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
          onClick={() => window.print()}
          disabled={!printData}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-bold text-white disabled:opacity-50"
        >
          <Printer size={15} />
          {printFormat === 'standard' ? 'In phiếu (bill thường)' : 'In phiếu (A5 ngang)'}
        </button>
        {preview && (
          <span className="text-[12px] text-muted-foreground">Chế độ xem trước A5 — kiểm tra nội dung trước khi in.</span>
        )}
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

      {printData && <WaybillInvoiceTemplate data={printData} />}
    </div>
  );
}
