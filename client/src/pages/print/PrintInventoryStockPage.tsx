import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Printer } from 'lucide-react';
import InventoryStockListTemplate from './InventoryStockListTemplate';
import { loadInventoryPrintPayloads } from './inventoryPrintUtils';
import './inventory-stock-list.css';

export default function PrintInventoryStockPage() {
  const navigate = useNavigate();
  const sheets = useMemo(() => loadInventoryPrintPayloads(), []);

  useEffect(() => {
    document.title = 'Danh sách tồn kho ECO';
  }, []);

  const hasRows = useMemo(() => sheets.some((payload) => payload.rows.length), [sheets]);

  if (!hasRows) {
    return (
      <div className="inventory-stock-wrap flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="mx-auto text-red-600" size={28} />
          <p className="mt-3 text-[14px] font-bold text-red-800">Không có dữ liệu in</p>
          <p className="mt-1 text-[13px] text-red-700">
            Quay lại trang tồn kho và bấm &quot;In danh sách tồn&quot; trước khi in.
          </p>
          <button
            type="button"
            onClick={() => navigate('/warehouse/inventory')}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-bold text-white"
          >
            <ArrowLeft size={16} />
            Danh sách tồn kho
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="inventory-stock-wrap">
      <div className="inventory-print-toolbar mx-auto mb-3 flex max-w-[297mm] flex-wrap items-center justify-between gap-2 print:hidden">
        <button
          type="button"
          onClick={() => navigate('/warehouse/inventory')}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[13px] font-bold"
        >
          <ArrowLeft size={16} />
          Quay lại
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-bold text-white"
        >
          <Printer size={16} />
          In {sheets.length > 1 ? `${sheets.length} bản tồn` : 'danh sách tồn'} (A4)
        </button>
      </div>
      {sheets.map((sheet, index) => (
        <div key={`${sheet.title || 'inventory'}-${index}`} className="inventory-print-sheet-group">
          <InventoryStockListTemplate data={sheet} />
        </div>
      ))}
    </div>
  );
}
