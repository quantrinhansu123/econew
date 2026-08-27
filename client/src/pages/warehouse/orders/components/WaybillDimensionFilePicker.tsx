import { Calculator, ExternalLink, FileSpreadsheet, Loader2, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError } from '../../../../lib/api';
import { uploadWaybillDimensionFile } from '../../../../lib/uploadImage';
import { calculateDimensionRow, calculateDimensionTotals, createDimensionWorkbookFile, hasCompleteDimensions, type DimensionRow } from '../waybillDimensionUtils';

interface Props {
  url: string; name: string; waybillCode?: string; packageCount?: string; disabled?: boolean;
  onChange: (url: string, name: string) => void;
  onTotalsChange?: (totals: { packageCount: number; volumeM3: number; convertedWeightKg: number }) => void;
  onUploadingChange?: (value: boolean) => void;
}

const makeRow = (quantity = '1'): DimensionRow => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, quantity, lengthCm: '', widthCm: '', heightCm: '' });
const displayDecimal = (value: number, maximumFractionDigits = 6) => value.toLocaleString('vi-VN', { maximumFractionDigits });

export default function WaybillDimensionFilePicker({ url, name, waybillCode = '', packageCount = '1', disabled, onChange, onTotalsChange, onUploadingChange }: Props) {
  const [uploading, setUploading] = useState(false); const [open, setOpen] = useState(false); const [error, setError] = useState('');
  const [rows, setRows] = useState<DimensionRow[]>([makeRow(packageCount)]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const totals = useMemo(() => calculateDimensionTotals(rows), [rows]);

  const runUpload = async (file: File, nextTotals?: typeof totals) => {
    setUploading(true); onUploadingChange?.(true); setError('');
    try {
      onChange(await uploadWaybillDimensionFile(file), file.name);
      if (nextTotals) onTotalsChange?.(nextTotals);
      setOpen(false);
    } catch (failure) { setError(failure instanceof ApiError ? failure.message : 'Không upload được file quy đổi.'); }
    finally { setUploading(false); onUploadingChange?.(false); }
  };
  const openEditor = () => { if (disabled || uploading) return; if (!rows.some(hasCompleteDimensions)) setRows([makeRow(packageCount || '1')]); setError(''); setOpen(true); };
  const updateRow = (id: string, field: keyof Omit<DimensionRow, 'id'>, value: string) => setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value.replace(/[^\d.,]/g, '') } : row));
  const saveWorkbook = async () => {
    const validRows = rows.filter(hasCompleteDimensions);
    if (!validRows.length) { setError('Nhập đủ số kiện, chiều dài, chiều rộng và chiều cao cho ít nhất một dòng.'); return; }
    await runUpload(createDimensionWorkbookFile(validRows, waybillCode), calculateDimensionTotals(validRows));
  };

  return <>
    <div className="col-span-12 rounded-lg border border-blue-200 bg-blue-50/40 px-3 py-2.5 sm:col-span-6 xl:col-span-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" disabled={disabled || uploading} onClick={openEditor} className="min-w-0 text-left disabled:cursor-not-allowed disabled:opacity-50"><p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-blue-800"><FileSpreadsheet size={14} />Bảng quy đổi kích thước</p><p className="mt-0.5 text-[10px] text-slate-500">Bấm để nhập kích thước và tự tính quy đổi.</p></button>
        <button type="button" onClick={openEditor} disabled={disabled || uploading} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-blue-300 bg-white px-2 text-[11px] font-extrabold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">{uploading ? <Loader2 size={13} className="animate-spin" /> : <Calculator size={13} />}{url ? 'Sửa bảng' : 'Nhập bảng'}</button>
      </div>
      {url && <div className="mt-2 flex items-center gap-2 rounded-md border border-blue-200 bg-white px-2 py-1.5"><FileSpreadsheet size={15} className="shrink-0 text-emerald-600" /><a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[11px] font-bold text-primary hover:underline">{name || 'Bảng quy đổi kích thước'}</a><ExternalLink size={12} className="text-slate-400" /><button type="button" title="Bỏ file" disabled={disabled} onClick={() => onChange('', '')} className="text-red-500 disabled:opacity-50"><Trash2 size={13} /></button></div>}
      {error && !open && <p className="mt-1 text-[10px] font-bold text-red-600">{error}</p>}
    </div>

    {open && createPortal(<div className="fixed inset-0 z-[10020] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm" onClick={() => !uploading && setOpen(false)} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-slate-50 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-white px-4 py-3 sm:px-6"><div><p className="text-[11px] font-bold uppercase tracking-wider text-primary">Quy đổi hàng hóa</p><h2 className="text-lg font-black">Bảng quy đổi kích thước</h2><p className="text-xs text-muted-foreground">CBM = Số kiện × Dài × Rộng × Cao / 1.000.000 · TL quy đổi = / 5.000</p></div><button type="button" onClick={() => setOpen(false)} disabled={uploading} aria-label="Đóng bảng quy đổi" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X size={20} /></button></div>
        <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5">
          <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[820px] border-collapse text-[13px]">
            <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600"><tr>{['STT', 'Số kiện', 'Dài (cm)', 'Rộng (cm)', 'Cao (cm)', 'CBM (m³)', 'TL quy đổi (kg)', ''].map((label) => <th key={label || 'action'} className="border-b border-r border-border px-3 py-2.5 text-center font-bold last:border-r-0">{label}</th>)}</tr></thead>
            <tbody>{rows.map((row, index) => { const result = calculateDimensionRow(row); return <tr key={row.id} className="border-b border-border last:border-b-0"><td className="border-r border-border px-3 py-2 text-center font-bold text-slate-500">{index + 1}</td>{(['quantity', 'lengthCm', 'widthCm', 'heightCm'] as const).map((field) => <td key={field} className="border-r border-border p-1.5"><input aria-label={`${field} dòng ${index + 1}`} value={row[field]} onChange={(event) => updateRow(row.id, field, event.target.value)} inputMode="decimal" className="h-9 w-full min-w-20 rounded-md border border-transparent bg-blue-50/50 px-2 text-right font-bold tabular-nums outline-none focus:border-primary focus:bg-white" /></td>)}<td className="border-r border-border px-3 py-2 text-right font-extrabold tabular-nums text-emerald-700">{displayDecimal(result.volumeM3)}</td><td className="border-r border-border px-3 py-2 text-right font-extrabold tabular-nums text-blue-700">{displayDecimal(result.convertedWeightKg, 2)}</td><td className="px-2 text-center"><button type="button" title="Xóa dòng" disabled={rows.length === 1 || uploading} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-30"><Trash2 size={15} /></button></td></tr>; })}</tbody>
            <tfoot className="bg-blue-50 font-black text-slate-800"><tr><td className="border-r border-t border-border px-3 py-3 text-center">Tổng</td><td className="border-r border-t border-border px-3 py-3 text-right tabular-nums">{totals.packageCount}</td><td className="border-t border-border" colSpan={3} /><td className="border-l border-r border-t border-border px-3 py-3 text-right tabular-nums text-emerald-700">{displayDecimal(totals.volumeM3)}</td><td className="border-r border-t border-border px-3 py-3 text-right tabular-nums text-blue-700">{displayDecimal(totals.convertedWeightKg, 2)}</td><td className="border-t border-border" /></tr></tfoot>
          </table></div></div>
          <button type="button" disabled={uploading} onClick={() => setRows((current) => [...current, makeRow()])} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/30 bg-blue-50 px-3 text-xs font-bold text-primary hover:bg-blue-100 disabled:opacity-50"><Plus size={15} />Thêm dòng</button>
          {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-white px-4 py-3 sm:px-6"><div><input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void runUpload(file); event.currentTarget.value = ''; }} /><button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Upload size={16} />Dùng file có sẵn</button></div><div className="flex gap-2"><button type="button" disabled={uploading} onClick={() => setOpen(false)} className="h-10 rounded-lg border border-border px-4 text-sm font-bold">Hủy</button><button type="button" disabled={uploading} onClick={() => void saveWorkbook()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-60">{uploading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}Lưu bảng</button></div></div>
      </div>
    </div>, document.body)}
  </>;
}
