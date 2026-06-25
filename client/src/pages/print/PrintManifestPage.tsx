import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Loader2, Printer } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import type { DispatchLink } from '../warehouse/manifests/manifestDispatchDefaults';
import ManifestDispatchSheetTable, { rowKey } from '../warehouse/manifests/ManifestDispatchSheetTable';
import type { LoadPlanningManifest, ManifestDispatchFields } from '../warehouse/manifests/types';
import DispatchPrintColumnDropdown from './DispatchPrintColumnDropdown';
import type { DispatchPrintColumnId } from './dispatchPrintColumns';
import { loadVisibleDispatchColumnIds, saveVisibleDispatchColumnIds } from './dispatchPrintColumns';
import './inventory-stock-list.css';

const USER_PROFILE_KEY = 'eco_user_profile';
const MANAGER = 32;
const DIRECTOR = 64;

type EditableRows = Record<string, ManifestDispatchFields>;

function canViewPricing() {
  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
    if (!raw) return false;
    const roleMask = Number((JSON.parse(raw) as { role_mask?: number }).role_mask ?? 0);
    return (roleMask & (MANAGER | DIRECTOR)) !== 0;
  } catch {
    return false;
  }
}

function normalizeLinks(manifest: LoadPlanningManifest): DispatchLink[] {
  if (manifest.manifest_waybills?.length) return manifest.manifest_waybills as DispatchLink[];
  return (manifest.waybills ?? []).map((waybill, index) => ({
    waybill_id: waybill.id,
    loading_position: waybill.loading_position ?? index + 1,
    dispatch_fields: waybill.dispatch_fields,
    waybill,
  }));
}

function buildRows(links: DispatchLink[]): EditableRows {
  const rows: EditableRows = {};
  links.forEach((link) => {
    const key = rowKey(link);
    if (!key) return;
    rows[key] = {
      ...(link.waybill?.dispatch_fields ?? {}),
      ...(link.dispatch_fields ?? {}),
    };
  });
  return rows;
}

const manifestCode = (manifest: LoadPlanningManifest) =>
  manifest.manifest_code || manifest.code || `BK-${manifest.id}`;

export default function PrintManifestPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [manifest, setManifest] = useState<LoadPlanningManifest | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const showPricing = canViewPricing();
  const [printColumnIds, setPrintColumnIds] = useState<DispatchPrintColumnId[]>(() => loadVisibleDispatchColumnIds(showPricing));

  useEffect(() => {
    document.title = 'Bảng kê phát hàng ECO';
    if (!id) {
      setError('Thiếu mã bảng kê.');
      setIsLoading(false);
      return;
    }
    void apiRequest<LoadPlanningManifest>(`/manifests/${id}`)
      .then((response) => setManifest(response))
      .catch(() => setError('Không tải được dữ liệu bảng kê.'))
      .finally(() => setIsLoading(false));
  }, [id]);

  const links = useMemo(() => {
    if (!manifest) return [];
    return normalizeLinks(manifest).sort(
      (a, b) => Number(a.loading_position ?? 9999) - Number(b.loading_position ?? 9999),
    );
  }, [manifest]);

  const rows = useMemo(() => buildRows(links), [links]);

  const updatePrintColumnIds = (ids: DispatchPrintColumnId[]) => {
    saveVisibleDispatchColumnIds(ids);
    setPrintColumnIds(ids);
  };

  if (isLoading) {
    return (
      <div className="inventory-stock-wrap flex min-h-screen items-center justify-center p-6 text-[13px] font-bold text-muted-foreground">
        <Loader2 className="mr-2 animate-spin" size={18} />
        Đang tải bảng kê...
      </div>
    );
  }

  if (error || !manifest || !links.length) {
    return (
      <div className="inventory-stock-wrap flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="mx-auto text-red-600" size={28} />
          <p className="mt-3 text-[14px] font-bold text-red-800">{error || 'Bảng kê chưa có dòng hàng để in.'}</p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-bold text-white"
          >
            <ArrowLeft size={16} />
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="inventory-stock-wrap manifest-dispatch-print-page">
      <div className="inventory-print-toolbar mx-auto mb-3 flex max-w-[297mm] flex-wrap items-center justify-between gap-2 print:hidden">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[13px] font-bold"
        >
          <ArrowLeft size={16} />
          Quay lại
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <DispatchPrintColumnDropdown
            value={printColumnIds}
            canViewPricing={showPricing}
            onChange={updatePrintColumnIds}
          />
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-bold text-white"
          >
            <Printer size={16} />
            In bảng kê
          </button>
        </div>
      </div>

      <div className="inventory-stock-sheet manifest-dispatch-sheet">
        <h1 className="inventory-stock-title">BẢNG KÊ PHÁT HÀNG ECO</h1>
        <p className="manifest-dispatch-sheet-meta">
          {manifestCode(manifest)} · {links.length} dòng hàng
        </p>
        <div className="manifest-dispatch-sheet-scroll">
          <ManifestDispatchSheetTable
            manifest={manifest}
            links={links}
            rows={rows}
            visibleColumnIds={printColumnIds}
            readOnly
          />
        </div>
        <p className="inventory-stock-meta">
          In lúc:{' '}
          {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())}
        </p>
      </div>
    </div>
  );
}
