import { useRef, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../../../../lib/api';
import type { CreatedWaybill, HubSummary } from '../types';
import {
  annotateBulkRows,
  applyServerNextCodesToBulkRows,
  assignBulkWaybillCodes,
  bulkRowToOrderForm,
  downloadOrderBulkTemplate,
  enrichOrderBulkRowsWithCustomers,
  parseOrderBulkWorkbook,
  resolveBulkHubId,
  type ParsedOrderBulkRow,
} from '../orderBulkExcelUtils';
import { createBulkWaybillWithFreshCode } from '../orderBulkCreate';
import type { CustomerRecord } from '../../customers/customerFormTypes';
import type { CustomerListItem, CustomerListResponse } from '../../customers/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  hubs: HubSummary[];
  existingWaybillCodes: string[];
  defaultNvgn: string;
  onImported: () => void | Promise<void>;
}

type ImportResult = {
  rowNumber: number;
  waybillCode: string;
  ok: boolean;
  message: string;
};

type NextWaybillCodeResponse = { waybill_code?: string; code?: string };

const customerList = (payload: CustomerListResponse | CustomerListItem[]) =>
  Array.isArray(payload) ? payload : payload.items || [];

async function loadNextWaybillCode(originHubId: string) {
  const response = await apiRequest<NextWaybillCodeResponse>(
    `/waybills/next-code?origin_hub_id=${encodeURIComponent(originHubId)}`,
  );
  const code = (response.waybill_code || response.code || '').trim().toUpperCase();
  if (!code) throw new Error('API không trả về số bill mới.');
  return code;
}

async function refreshAutoAssignedPreviewCodes(rows: ParsedOrderBulkRow[], hubs: HubSummary[]) {
  const originHubIds = [...new Set(
    rows
      .filter((row) => row.autoAssignedWaybillCode)
      .map((row) => resolveBulkHubId(hubs, row.values.bcGui))
      .filter(Boolean),
  )];
  const nextCodes = await Promise.all(
    originHubIds.map(async (originHubId) => [originHubId, await loadNextWaybillCode(originHubId)] as const),
  );
  applyServerNextCodesToBulkRows(rows, hubs, new Map(nextCodes));
}

async function loadCustomersByCodes(codes: string[]): Promise<CustomerRecord[]> {
  const uniqueCodes = [...new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean))];
  const customers: CustomerRecord[] = [];
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < uniqueCodes.length) {
      const code = uniqueCodes[nextIndex];
      nextIndex += 1;
      const response = await apiRequest<CustomerListResponse | CustomerListItem[]>(
        `/customers?keyword=${encodeURIComponent(code)}&limit=5`,
      );
      const match = customerList(response).find((customer) => customer.code.trim().toUpperCase() === code);
      if (match) customers.push(match as CustomerRecord);
    }
  };

  await Promise.all(Array.from({ length: Math.min(6, uniqueCodes.length) }, () => worker()));
  return customers;
}

export default function OrderBulkImportDialog({
  isOpen,
  onClose,
  hubs,
  existingWaybillCodes,
  defaultNvgn,
  onImported,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedOrderBulkRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);

  if (!isOpen) return null;

  const validCount = rows.filter((row) => row.errors.length === 0).length;
  const invalidCount = rows.length - validCount;
  const successfulRowNumbers = new Set(
    results.filter((item) => item.ok).map((item) => item.rowNumber),
  );
  const pendingValidCount = rows.filter(
    (row) => row.errors.length === 0 && !successfulRowNumbers.has(row.rowNumber),
  ).length;

  const resetFileState = () => {
    setRows([]);
    setFileName('');
    setParseError('');
    setResults([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (isImporting || isReadingFile) return;
    resetFileState();
    onClose();
  };

  const handlePickFile = async (file: File | null) => {
    if (!file) return;
    setParseError('');
    setResults([]);
    setFileName(file.name);
    setIsReadingFile(true);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseOrderBulkWorkbook(buffer);
      if (!parsed.length) {
        setRows([]);
        setParseError('Không tìm thấy dòng dữ liệu trong file Excel.');
        return;
      }
      const customers = await loadCustomersByCodes(parsed.map((row) => row.values.maKh));
      const enriched = enrichOrderBulkRowsWithCustomers(parsed, customers);
      const annotated = annotateBulkRows(enriched, hubs);
      assignBulkWaybillCodes(annotated, hubs, existingWaybillCodes);
      try {
        await refreshAutoAssignedPreviewCodes(annotated, hubs);
      } catch {
        // Mã sẽ tiếp tục được lấy lại ngay trước từng POST khi người dùng bấm Nhập.
      }
      setRows(annotateBulkRows(annotated, hubs));
    } catch (error) {
      setRows([]);
      setParseError(error instanceof ApiError
        ? `Không tải được thông tin Mã KH: ${error.message}`
        : 'Không đọc được file Excel. Vui lòng dùng đúng mẫu .xlsx.');
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleImport = async () => {
    const completedRowNumbers = new Set(
      results.filter((item) => item.ok).map((item) => item.rowNumber),
    );
    const readyRows = rows.filter(
      (row) => row.errors.length === 0 && !completedRowNumbers.has(row.rowNumber),
    );
    if (!readyRows.length || isImporting) return;

    setIsImporting(true);
    const importResults: ImportResult[] = [];
    const resolvedCodes = new Map<number, string>();

    for (const row of readyRows) {
      try {
        const form = bulkRowToOrderForm(row.values, hubs, { nvgn: defaultNvgn });
        const created = await createBulkWaybillWithFreshCode({
          form,
          autoAssignedWaybillCode: row.autoAssignedWaybillCode === true,
          getNextWaybillCode: loadNextWaybillCode,
          createWaybill: (body) => apiRequest<CreatedWaybill>('/waybills', { method: 'POST', body }),
        });
        const code = (
          created.response.waybill_code
          || created.response.code
          || created.form.soBill
        ).toUpperCase();
        resolvedCodes.set(row.rowNumber, code);
        importResults.push({
          rowNumber: row.rowNumber,
          waybillCode: code,
          ok: true,
          message: 'Tạo thành công',
        });
      } catch (error) {
        importResults.push({
          rowNumber: row.rowNumber,
          waybillCode: row.values.soBill,
          ok: false,
          message: error instanceof Error ? error.message : 'Không thể tạo đơn.',
        });
      }
    }

    if (resolvedCodes.size) {
      setRows((currentRows) => currentRows.map((row) => {
        const code = resolvedCodes.get(row.rowNumber);
        return code ? { ...row, values: { ...row.values, soBill: code } } : row;
      }));
    }
    const attemptedRows = new Set(importResults.map((item) => item.rowNumber));
    setResults([
      ...results.filter((item) => !attemptedRows.has(item.rowNumber)),
      ...importResults,
    ].sort((a, b) => a.rowNumber - b.rowNumber));
    setIsImporting(false);
    await onImported();
  };

  const successCount = results.filter((item) => item.ok).length;
  const failCount = results.filter((item) => !item.ok).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={handleClose}
        aria-label="Đóng"
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-border bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700">
            <FileSpreadsheet size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-extrabold text-foreground">Nhập đơn hàng loạt</h2>
            <p className="text-[12px] font-medium text-muted-foreground">Tải mẫu Excel, điền dữ liệu và tải lên.</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isImporting || isReadingFile}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadOrderBulkTemplate}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-[12px] font-extrabold text-emerald-800 hover:bg-emerald-100"
            >
              <Download size={14} />
              Tải mẫu Excel
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting || isReadingFile}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary bg-primary px-3 text-[12px] font-extrabold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {isReadingFile ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {isReadingFile ? 'Đang đọc file' : 'Chọn file Excel'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => void handlePickFile(event.target.files?.[0] || null)}
            />
            {fileName && (
              <span className="inline-flex h-9 items-center rounded-lg border border-border bg-muted/20 px-3 text-[12px] font-semibold text-muted-foreground">
                {fileName}
              </span>
            )}
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
              <span className="ml-1 text-muted-foreground">
                · Số bill tự cấp sẽ được kiểm tra lại khi bấm Nhập
              </span>
            </div>
          )}

          {rows.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="custom-scrollbar max-h-[320px] overflow-auto">
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-border text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">Dòng</th>
                      <th className="px-3 py-2">Số bill</th>
                      <th className="px-3 py-2">Người gửi → nhận</th>
                      <th className="px-3 py-2">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.rowNumber} className="border-b border-border/70 last:border-b-0">
                        <td className="px-3 py-2 font-bold">{row.rowNumber}</td>
                        <td className="px-3 py-2 font-semibold">{row.values.soBill || '—'}</td>
                        <td className="px-3 py-2">
                          <p className="font-semibold">{row.values.nguoiGui} → {row.values.nguoiNhan}</p>
                          <p className="text-[11px] text-muted-foreground">{row.values.bcGui} → {row.values.bcDen}</p>
                        </td>
                        <td className="px-3 py-2">
                          {row.errors.length === 0 ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">
                              Sẵn sàng
                            </span>
                          ) : (
                            <div className="space-y-1">
                              {row.errors.map((error) => (
                                <p key={error} className="text-[11px] font-semibold text-red-600">{error}</p>
                              ))}
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
              <p className="text-[13px] font-extrabold text-foreground">
                Kết quả: thành công {successCount}, lỗi {failCount}
              </p>
              <div className="custom-scrollbar max-h-[180px] space-y-1 overflow-auto">
                {results.map((item) => (
                  <p
                    key={`${item.rowNumber}-${item.waybillCode}`}
                    className={clsx('text-[12px] font-semibold', item.ok ? 'text-emerald-700' : 'text-red-600')}
                  >
                    Dòng {item.rowNumber} · {item.waybillCode}: {item.message}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isImporting || isReadingFile}
            className="h-9 rounded-lg border border-border px-4 text-[12px] font-extrabold text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={isImporting || isReadingFile || pendingValidCount === 0}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary bg-primary px-4 text-[12px] font-extrabold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isImporting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Nhập {pendingValidCount > 0 ? `${pendingValidCount} đơn` : 'loạt'}
          </button>
        </div>
      </div>
    </div>
  );
}
