import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Printer, X } from 'lucide-react';
import DispatchPrintColumnDropdown from '../../../print/DispatchPrintColumnDropdown';
import type { DispatchPrintColumnId } from '../../../print/dispatchPrintColumns';
import { loadVisibleDispatchColumnIds, saveVisibleDispatchColumnIds } from '../../../print/dispatchPrintColumns';
import '../../../print/inventory-stock-list.css';
import ManifestDispatchPrintView from '../ManifestDispatchPrintView';
import {
  buildManifestPrintRows,
  manifestPrintCode,
  normalizeManifestPrintLinks,
  sortManifestPrintLinks,
} from '../manifestDispatchPrintUtils';
import type { LoadPlanningManifest } from '../types';

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  isLoading: boolean;
  manifest: LoadPlanningManifest | null;
  showPricing: boolean;
  onClose: () => void;
}

const PRINT_STYLE = `@media print {
  body > *:not(.manifest-print-dialog-root) { display: none !important; }
  .manifest-print-dialog-root {
    display: block !important;
    position: static !important;
    inset: auto !important;
    background: #fff !important;
    padding: 0 !important;
    backdrop-filter: none !important;
  }
  .manifest-print-dialog-panel {
    display: block !important;
    width: 100% !important;
    max-width: none !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: #fff !important;
  }
  .manifest-print-dialog-toolbar { display: none !important; }
  .manifest-print-dialog-body {
    display: block !important;
    overflow: visible !important;
    max-height: none !important;
    padding: 0 !important;
  }
}`;

export default function PrintManifestDialog({ isOpen, isClosing, isLoading, manifest, showPricing, onClose }: Props) {
  const [printColumnIds, setPrintColumnIds] = useState<DispatchPrintColumnId[]>(() => loadVisibleDispatchColumnIds(showPricing));

  const links = useMemo(() => {
    if (!manifest) return [];
    return sortManifestPrintLinks(normalizeManifestPrintLinks(manifest));
  }, [manifest]);

  const rows = useMemo(() => buildManifestPrintRows(links), [links]);
  const hasRows = links.length > 0;

  if (!isOpen) return null;

  const updatePrintColumnIds = (ids: DispatchPrintColumnId[]) => {
    saveVisibleDispatchColumnIds(ids);
    setPrintColumnIds(ids);
  };

  return createPortal(
    <div className="manifest-print-dialog-root manifest-dispatch-print-page fixed inset-0 z-[9999] flex justify-end print:static print:block print:bg-white print:p-0">
      <style>{PRINT_STYLE}</style>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-md print:hidden" onClick={onClose} />
      <div
        className={`manifest-print-dialog-panel relative flex h-screen w-full max-w-[min(1280px,98vw)] flex-col border-l border-border bg-[#e8eef5] shadow-2xl print:block print:h-auto print:max-h-none print:overflow-visible print:border-0 print:bg-white print:shadow-none ${isClosing ? 'dialog-slide-out' : 'dialog-slide-in'}`}
      >
        <div className="manifest-print-dialog-toolbar flex shrink-0 items-center justify-between border-b border-border bg-white px-5 py-4 print:hidden">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">In bảng kê phát hàng</p>
            <h2 className="text-lg font-extrabold text-foreground">{manifest ? manifestPrintCode(manifest) : '—'}</h2>
          </div>
          <div className="flex items-center gap-2">
            <DispatchPrintColumnDropdown value={printColumnIds} canViewPricing={showPricing} onChange={updatePrintColumnIds} />
            <button
              type="button"
              onClick={() => window.print()}
              disabled={isLoading || !hasRows}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-bold text-white disabled:opacity-50"
            >
              <Printer size={16} />
              In
            </button>
            <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white text-muted-foreground hover:bg-muted">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="manifest-print-dialog-body min-h-0 flex-1 overflow-auto p-4 custom-scrollbar print:block print:overflow-visible print:p-0">
          {isLoading ? (
            <div className="flex min-h-[320px] items-center justify-center gap-2 text-[13px] font-bold text-muted-foreground print:hidden">
              <Loader2 className="animate-spin" size={18} />
              Đang tải dữ liệu in...
            </div>
          ) : !hasRows || !manifest ? (
            <div className="flex min-h-[320px] items-center justify-center text-[13px] font-bold text-muted-foreground print:hidden">
              Bảng kê chưa có dòng hàng để in.
            </div>
          ) : (
            <ManifestDispatchPrintView
              manifest={manifest}
              links={links}
              rows={rows}
              visibleColumnIds={printColumnIds}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
