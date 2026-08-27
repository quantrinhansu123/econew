import { Camera, FileImage, Images, Loader2, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { ImagePreviewModal } from '../../../../components/ImagePreviewModal';
import { ApiError } from '../../../../lib/api';
import { IMAGE_UPLOAD_ACCEPT, uploadVehicleDocument } from '../../../../lib/uploadImage';

export const MAX_TRUCK_DOCUMENT_IMAGES = 10;

interface Props {
  value: string[];
  disabled?: boolean;
  onChange: (urls: string[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
}

export default function TruckDocumentImagePicker({ value, disabled, onChange, onUploadingChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const images = value.slice(0, MAX_TRUCK_DOCUMENT_IMAGES);

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length || uploading || disabled) return;
    const selected = Array.from(files).slice(0, MAX_TRUCK_DOCUMENT_IMAGES - images.length);
    if (!selected.length) { setError(`Mỗi xe chỉ lưu tối đa ${MAX_TRUCK_DOCUMENT_IMAGES} ảnh giấy tờ.`); return; }
    setUploading(true); onUploadingChange?.(true); setError('');
    try {
      const uploaded: string[] = [];
      let firstError = '';
      for (const file of selected) {
        try { uploaded.push(await uploadVehicleDocument(file)); }
        catch (failure) { if (!firstError) firstError = failure instanceof ApiError ? failure.message : 'Có ảnh không upload được.'; }
      }
      if (uploaded.length) onChange([...images, ...uploaded].slice(0, MAX_TRUCK_DOCUMENT_IMAGES));
      if (firstError) setError(firstError);
    } finally { setUploading(false); onUploadingChange?.(false); }
  };

  return <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div><p className="flex items-center gap-2 text-[13px] font-extrabold text-foreground"><Images size={16} className="text-primary" />Ảnh giấy tờ xe ({images.length}/{MAX_TRUCK_DOCUMENT_IMAGES})</p><p className="mt-1 text-[11px] font-medium text-muted-foreground">Đăng ký, đăng kiểm, bảo hiểm và giấy tờ liên quan. Mỗi ảnh tối đa 5 MB.</p></div>
      {images.length < MAX_TRUCK_DOCUMENT_IMAGES && <div className="flex gap-1.5">
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-[11px] font-bold text-primary hover:bg-blue-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">{uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}{uploading ? 'Đang tải...' : 'Chụp ảnh'}<input type="file" accept="image/*" capture="environment" disabled={disabled || uploading} className="hidden" onChange={(event) => { void uploadFiles(event.target.files); event.target.value = ''; }} /></label>
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-[11px] font-bold text-primary hover:bg-blue-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"><Plus size={14} />Chọn ảnh<input type="file" accept={IMAGE_UPLOAD_ACCEPT} multiple disabled={disabled || uploading} className="hidden" onChange={(event) => { void uploadFiles(event.target.files); event.target.value = ''; }} /></label>
      </div>}
    </div>
    {error && <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">{error}</p>}
    {images.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{images.map((url, index) => <div key={`${url}-${index}`} className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-white"><button type="button" onClick={() => setPreviewUrl(url)} className="h-full w-full"><img src={url} alt={`Giấy tờ xe ${index + 1}`} className="h-full w-full object-cover" /></button>{!disabled && !uploading && <button type="button" aria-label={`Xóa ảnh giấy tờ ${index + 1}`} onClick={() => onChange(images.filter((_, imageIndex) => imageIndex !== index))} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/75 text-white hover:bg-red-600"><X size={13} /></button>}</div>)}</div> : <div className="flex min-h-20 items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white text-[12px] font-semibold text-slate-500"><FileImage size={18} />Chưa có ảnh giấy tờ xe.</div>}
    <ImagePreviewModal imageUrl={previewUrl} title="Ảnh giấy tờ xe" onClose={() => setPreviewUrl(null)} />
  </div>;
}
