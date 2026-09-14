import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckSquare,
  Download,
  HardDriveDownload,
  Loader2,
  RefreshCw,
  Square,
  Upload,
} from 'lucide-react';
import { ApiError, apiRequest } from '../../../lib/api';
import { getStoredAuthUser } from '../../../lib/authUser';
import type { BackupImportMode, BackupImportResult, BackupTableMeta, SupabaseTableBackup } from './backup/types';

const DIRECTOR = 64;
const formatCount = (value: number) => value.toLocaleString('vi-VN');

export default function AdminBackupPage() {
  const user = getStoredAuthUser();
  const isDirector = ((user?.role_mask ?? 0) & DIRECTOR) !== 0;

  const [tables, setTables] = useState<BackupTableMeta[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [importMode, setImportMode] = useState<BackupImportMode>('upsert');
  const fileRef = useRef<HTMLInputElement>(null);

  const loadTables = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await apiRequest<BackupTableMeta[]>('/backup/tables');
      setTables(rows);
      setSelected(new Set(rows.map((row) => row.name)));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Không tải được danh sách bảng.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isDirector) void loadTables();
    else setLoading(false);
  }, [isDirector]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((table) => table.name.toLowerCase().includes(q));
  }, [tables, keyword]);

  const selectedCount = selected.size;
  const selectedRows = useMemo(
    () => tables.filter((table) => selected.has(table.name)).reduce((sum, table) => sum + Number(table.row_count || 0), 0),
    [tables, selected],
  );

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectFiltered = (on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const table of filtered) {
        if (on) next.add(table.name);
        else next.delete(table.name);
      }
      return next;
    });
  };

  const downloadBackup = async () => {
    if (!selectedCount) {
      setError('Chọn ít nhất một bảng để tải backup.');
      return;
    }
    setExporting(true);
    setError('');
    setMessage('');
    try {
      const payload = await apiRequest<SupabaseTableBackup>('/backup/export', {
        method: 'POST',
        body: { tables: [...selected] },
      });

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `eco-supabase-backup-${stamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage(`Đã tải backup ${selectedCount} bảng (${formatCount(selectedRows)} dòng ước tính).`);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Xuất backup thất bại.');
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    setError('');
    setMessage('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as SupabaseTableBackup;
      if (parsed.format !== 'supabase-table-backup') {
        throw new Error('File không đúng định dạng supabase-table-backup.');
      }
      if (!parsed.tables?.length) {
        throw new Error('File backup không có bảng dữ liệu.');
      }

      const confirmLabel =
        importMode === 'replace'
          ? `REPLACE sẽ XÓA toàn bộ dữ liệu các bảng trong file rồi ghi lại. Tiếp tục với ${parsed.tables.length} bảng?`
          : `Khôi phục ${parsed.tables.length} bảng ở chế độ ${importMode}?`;
      if (!window.confirm(confirmLabel)) return;

      const result = await apiRequest<BackupImportResult>('/backup/import', {
        method: 'POST',
        body: { ...parsed, mode: importMode },
      });

      setMessage(
        `Đã khôi phục ${result.imported_tables.length} bảng · thêm ${formatCount(result.inserted)} · cập nhật ${formatCount(result.updated)} · bỏ qua ${formatCount(result.skipped)}.`,
      );
      await loadTables();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : requestError instanceof Error
            ? requestError.message
            : 'Khôi phục backup thất bại.',
      );
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (!isDirector) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-[13px] font-semibold text-amber-800">
        Chỉ Ban giám đốc (DIRECTOR) được dùng Backup dữ liệu.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Quản trị</p>
            <h1 className="mt-1 text-xl font-black text-foreground">Backup dữ liệu</h1>
            <p className="mt-1 max-w-3xl text-[13px] font-medium text-muted-foreground">
              Xuất/nhập JSON theo schema <code className="rounded bg-muted px-1">public</code> của Supabase
              (<code className="rounded bg-muted px-1">format: supabase-table-backup</code>). Chọn bảng cần backup, tải về, rồi đẩy lên khi cần khôi phục.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadTables()}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-[13px] font-bold text-foreground hover:bg-muted"
          >
            <RefreshCw size={16} /> Làm mới
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-muted/30 px-3 py-3">
            <p className="text-[11px] font-bold uppercase text-muted-foreground">Bảng đã chọn</p>
            <p className="mt-1 text-lg font-black text-foreground">{formatCount(selectedCount)} / {formatCount(tables.length)}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 px-3 py-3">
            <p className="text-[11px] font-bold uppercase text-muted-foreground">Dòng ước tính</p>
            <p className="mt-1 text-lg font-black text-foreground">{formatCount(selectedRows)}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 px-3 py-3">
            <p className="text-[11px] font-bold uppercase text-muted-foreground">Định dạng</p>
            <p className="mt-1 text-[13px] font-extrabold text-foreground">supabase-table-backup v1</p>
          </div>
        </div>
      </div>

      {(error || message) && (
        <div className={error ? 'rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700' : 'rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-700'}>
          {error || message}
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[1fr_320px]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Lọc tên bảng…"
              className="h-10 min-w-[220px] flex-1 rounded-xl border border-border bg-white px-3 text-[13px] font-medium outline-none focus:ring-2 focus:ring-primary/15"
            />
            <button type="button" onClick={() => selectFiltered(true)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-[12px] font-bold hover:bg-muted">
              <CheckSquare size={14} /> Chọn lọc
            </button>
            <button type="button" onClick={() => selectFiltered(false)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-[12px] font-bold hover:bg-muted">
              <Square size={14} /> Bỏ lọc
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-16 text-[13px] font-semibold text-muted-foreground">
                <Loader2 className="animate-spin" size={18} /> Đang tải danh sách bảng…
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-16 text-center text-[13px] font-semibold text-muted-foreground">Không có bảng khớp bộ lọc.</div>
            ) : (
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="w-12 px-4 py-2.5 font-bold" />
                    <th className="px-4 py-2.5 font-bold">Bảng (public)</th>
                    <th className="px-4 py-2.5 font-bold">Khóa chính</th>
                    <th className="px-4 py-2.5 text-right font-bold">Số dòng ~</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((table) => {
                    const checked = selected.has(table.name);
                    return (
                      <tr key={table.name} className="border-t border-border hover:bg-muted/20">
                        <td className="px-4 py-2.5">
                          <input type="checkbox" checked={checked} onChange={() => toggle(table.name)} className="h-4 w-4 accent-primary" />
                        </td>
                        <td className="px-4 py-2.5 text-[13px] font-extrabold text-foreground">{table.name}</td>
                        <td className="px-4 py-2.5 text-[12px] font-medium text-muted-foreground">{table.primary_key.join(', ') || '—'}</td>
                        <td className="px-4 py-2.5 text-right text-[13px] font-bold tabular-nums">{formatCount(table.row_count)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-[14px] font-black text-foreground">
              <Download size={16} className="text-primary" /> Tải backup
            </h2>
            <p className="mt-2 text-[12px] font-medium text-muted-foreground">
              File JSON có thể mở bằng text editor hoặc dùng lại để restore. Cấu trúc bảng/cột khớp schema Supabase.
            </p>
            <button
              type="button"
              disabled={exporting || !selectedCount}
              onClick={() => void downloadBackup()}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-extrabold text-primary-foreground disabled:opacity-60"
            >
              {exporting ? <Loader2 className="animate-spin" size={16} /> : <HardDriveDownload size={16} />}
              Tải JSON đã chọn
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-[14px] font-black text-foreground">
              <Upload size={16} className="text-primary" /> Đẩy lên / khôi phục
            </h2>
            <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Chế độ ghi</label>
            <select
              value={importMode}
              onChange={(event) => setImportMode(event.target.value as BackupImportMode)}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-[13px] font-semibold"
            >
              <option value="upsert">Upsert (thêm mới / cập nhật theo PK)</option>
              <option value="insert_only">Chỉ thêm mới (bỏ qua trùng)</option>
              <option value="replace">Replace (xóa bảng rồi ghi lại)</option>
            </select>

            {importMode === 'replace' && (
              <div className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                Replace sẽ xóa hết dữ liệu các bảng có trong file trước khi ghi.
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImportFile(file);
              }}
            />
            <button
              type="button"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 text-[13px] font-extrabold text-foreground hover:bg-muted disabled:opacity-60"
            >
              {importing ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
              Chọn file JSON để đẩy lên
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
