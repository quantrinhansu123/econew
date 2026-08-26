import { ExternalLink, FileSpreadsheet, Loader2, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../../../../lib/api';
import { uploadWaybillDimensionFile } from '../../../../lib/uploadImage';

export default function WaybillDimensionFilePicker({ url, name, disabled, onChange, onUploadingChange }: { url: string; name: string; disabled?: boolean; onChange: (url: string, name: string) => void; onUploadingChange?: (value: boolean) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const select = async (file?: File) => {
    if (!file) return;
    setUploading(true); onUploadingChange?.(true); setError('');
    try { onChange(await uploadWaybillDimensionFile(file), file.name); }
    catch (failure) { setError(failure instanceof ApiError ? failure.message : 'Không upload được file quy đổi.'); }
    finally { setUploading(false); onUploadingChange?.(false); }
  };
  return <div className="col-span-12 rounded-lg border border-blue-200 bg-blue-50/40 px-3 py-2.5 sm:col-span-6 xl:col-span-4">
    <div className="flex items-center justify-between gap-2"><div className="min-w-0"><p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-blue-800"><FileSpreadsheet size={14} />Bảng quy đổi kích thước</p><p className="mt-0.5 text-[10px] text-slate-500">Lưu file Excel gốc cùng vận đơn để đối chiếu.</p></div>
      <label className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-blue-300 bg-white px-2 text-[11px] font-extrabold text-blue-700 ${disabled || uploading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-blue-50'}`}>{uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}{url ? 'Đổi file' : 'Chọn file'}<input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" disabled={disabled || uploading} className="hidden" onChange={(event) => { void select(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} /></label></div>
    {url && <div className="mt-2 flex items-center gap-2 rounded-md border border-blue-200 bg-white px-2 py-1.5"><FileSpreadsheet size={15} className="shrink-0 text-emerald-600" /><a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[11px] font-bold text-primary hover:underline">{name || 'Bảng quy đổi kích thước'}</a><ExternalLink size={12} className="text-slate-400" /><button type="button" title="Bỏ file" disabled={disabled} onClick={() => onChange('', '')} className="text-red-500 disabled:opacity-50"><Trash2 size={13} /></button></div>}
    {error && <p className="mt-1 text-[10px] font-bold text-red-600">{error}</p>}
  </div>;
}
