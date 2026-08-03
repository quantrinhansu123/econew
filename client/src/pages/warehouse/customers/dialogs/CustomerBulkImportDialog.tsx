import { useRef, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../../../../lib/api';
import {
  buildCustomerBulkPayload,
  downloadCustomerBulkTemplate,
  parseCustomerBulkWorkbook,
  type ParsedCustomerBulkRow,
} from '../customerBulkExcelUtils';
import type { CustomerListItem, CustomerListResponse } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void | Promise<void>;
}

interface ImportResult {
  rowNumber: number;
  code: string;
  action: 'Tạo mới' | 'Cập nhật';
  ok: boolean;
  message: string;
}

const normalizeList = (payload: CustomerListResponse | CustomerListItem[]) =>
  Array.isArray(payload) ? payload : payload.items || [];

async function findExistingCustomers(rows: ParsedCustomerBulkRow[]) {
  const codes = [...new Set(rows.map((row) => row.values.code).filter(Boolean))];
  const existingByCode = new Map<string, string>();
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < codes.length) {
      const code = codes[nextIndex];
      nextIndex += 1;
      const response = await apiRequest<CustomerListResponse | CustomerListItem[]>(
        `/customers?keyword=${encodeURIComponent(code)}&limit=5`,
      );
      const match = normalizeList(response).find(
        (customer) => customer.code.trim().toUpperCase() === code,
      );
      if (match) existingByCode.set(code, String(match.id));
    }
  };

  await Promise.all(Array.from({ length: Math.min(6, codes.length) }, () => worker()));
  return rows.map((row) => ({
    ...row,
    existingCustomerId: existingByCode.get(row.values.code),
  }));
}

export default function CustomerBulkImportDialog({ isOpen, onClose, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedCustomerBulkRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);

  if (!isOpen) return null;

  const validCount = rows.filter((row) => row.errors.length === 0).length;
  const invalidCount = rows.length - validCount;
  const successfulRows = new Set(results.filter((result) => result.ok).map((result) => result.rowNumber));
  const pendingCount = rows.filter(
    (row) => row.errors.length === 0 && !successfulRows.has(row.rowNumber),
  ).length;

  const reset = () => {
    setRows([]);
    setFileName('');
    setParseError('');
    setResults([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (isReadingFile || isImporting) return;
    reset();
    onClose();
  };

  const handlePickFile = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    setParseError('');
    setResults([]);
    setIsReadingFile(true);
    try {
      const parsed = parseCustomerBulkWorkbook(await file.arrayBuffer());
      if (!parsed.length) {
        setRows([]);
        setParseError('Không tìm thấy dữ liệu khách hàng. Vui lòng dùng đúng mẫu Excel.');
        return;
      }
      setRows(await findExistingCustomers(parsed));
    } catch (error) {
      setRows([]);
      setParseError(
        error instanceof ApiError
          ? `Không kiểm tra được Mã KH: ${error.message}`
          : 'Không đọc được file Excel. Vui lòng dùng đúng mẫu .xlsx.',
      );
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleImport = async () => {
    if (!pendingCount || isImporting) return;
    const completedRows = new Set(results.filter((result) => result.ok).map((result) => result.rowNumber));
    const readyRows = rows.filter(
      (row) => row.errors.length === 0 && !completedRows.has(row.rowNumber),
    );
    setIsImporting(true);
    const nextResults: ImportResult[] = [];

    for (const row of readyRows) {
      const updating = Boolean(row.existingCustomerId);
      const action = updating ? 'Cập nhật' : 'Tạo mới';
      try {
        await apiRequest(
          updating ? `/customers/${row.existingCustomerId}` : '/customers',
          {
            method: updating ? 'PATCH' : 'POST',
            body: buildCustomerBulkPayload(row.values, updating),
          },
        );
        nextResults.push({
          rowNumber: row.rowNumber,
          code: row.values.code,
          action,
          ok: true,
          message: `${action} thành công`,
        });
      } catch (error) {
        nextResults.push({
          rowNumber: row.rowNumber,
          code: row.values.code,
          action,
          ok: false,
          message: error instanceof Error ? error.message : 'Không thể lưu khách hàng.',
        });
      }
    }

    const attemptedRows = new Set(nextResults.map((result) => result.rowNumber));
    setResults([
      ...results.filter((result) => !attemptedRows.has(result.rowNumber)),
      ...nextResults,
    ].sort((a, b) => a.rowNumber - b.rowNumber));
    setIsImporting(false);
    await onImported();
  };

  const successCount = results.filter((result) => result.ok).length;
  const failCount = results.length - successCount;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={handleClose} aria-label="Đóng" />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-border bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700">
            <FileSpreadsheet size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-extrabold text-foreground">Nhập khách hàng hàng loạt</h2>
            <p className="text-[12px] font-medium text-muted-foreground">Tải mẫu Excel, điền danh sách rồi xem trước trước khi nhập.</p>
          </div>
          <button type="button" onClick={handleClose} disabled={isReadingFile || isImporting} className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadCustomerBulkTemplate} className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-[12px] font-extrabold text-emerald-800 hover:bg-emerald-100">
              <Download size={14} />
              Tải mẫu Excel
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isReadingFile || isImporting} className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary bg-primary px-3 text-[12px] font-extrabold text-white hover:bg-primary/90 disabled:opacity-50">
              {isReadingFile ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {isReadingFile ? 'Đang đọc file' : 'Chọn file Excel'}
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => void handlePickFile(event.target.files?.[0] || null)} />
            {fileName && <span className="inline-flex h-9 items-center rounded-lg border border-border bg-muted/20 px-3 text-[12px] font-semibold text-muted-foreground">{fileName}</span>}
          </div>

          {parseError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
              <AlertTriangle className="mr-1 inline" size={14} />
              {parseError}
            </div>
          )}

          {rows.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/10 px-3 py-2 text-[12px] font-semibold text-foreground">
              Đã đọc {rows.length} dòng · Hợp lệ {validCount} · Lỗi {invalidCount}
              <span className="ml-1 text-muted-foreground">· Mã đã có sẽ cập nhật, mã mới sẽ được tạo</span>
            </div>
          )}

          {rows.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="custom-scrollbar max-h-[330px] overflow-auto">
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-border text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">Dòng</th>
                      <th className="px-3 py-2">Mã KH</th>
                      <th className="px-3 py-2">Tên khách hàng</th>
                      <th className="px-3 py-2">Thao tác</th>
                      <th className="px-3 py-2">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.rowNumber} className="border-b border-border/70 last:border-b-0">
                        <td className="px-3 py-2 font-bold">{row.rowNumber}</td>
                        <td className="px-3 py-2 font-extrabold text-primary">{row.values.code || '—'}</td>
                        <td className="px-3 py-2 font-semibold">{row.values.name || '—'}</td>
                        <td className="px-3 py-2">{row.existingCustomerId ? 'Cập nhật' : 'Tạo mới'}</td>
                        <td className="px-3 py-2">
                          {row.errors.length === 0 ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">Sẵn sàng</span>
                          ) : (
                            <div className="space-y-1">
                              {row.errors.map((error) => <p key={error} className="text-[11px] font-semibold text-red-600">{error}</p>)}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <p className="text-[13px] font-extrabold text-foreground">Kết quả: thành công {successCount}, lỗi {failCount}</p>
              <div className="custom-scrollbar max-h-[180px] space-y-1 overflow-auto">
                {results.map((result) => (
                  <p key={`${result.rowNumber}-${result.code}`} className={clsx('text-[12px] font-semibold', result.ok ? 'text-emerald-700' : 'text-red-600')}>
                    Dòng {result.rowNumber} · {result.code}: {result.message}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button type="button" onClick={handleClose} disabled={isReadingFile || isImporting} className="h-9 rounded-lg border border-border px-4 text-[12px] font-extrabold text-muted-foreground hover:bg-muted disabled:opacity-50">Đóng</button>
          <button type="button" onClick={() => void handleImport()} disabled={isReadingFile || isImporting || pendingCount === 0} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[12px] font-extrabold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
            {isImporting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Nhập {pendingCount > 0 ? `${pendingCount} khách hàng` : 'loạt'}
          </button>
        </div>
      </div>
    </div>
  );
}
