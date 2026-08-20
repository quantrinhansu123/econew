import { ExternalLink, ImagePlus, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../../lib/api';
import { IMAGE_UPLOAD_ACCEPT, uploadExpenseReceipt } from '../../lib/uploadImage';

const MAX_RECEIPTS = 6;

interface ReceiptImagePickerProps {
  images: string[];
  onChange: (images: string[]) => void;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
}

export function ReceiptImagePicker({ images, onChange, disabled = false, onUploadingChange }: ReceiptImagePickerProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const available = Math.max(0, MAX_RECEIPTS - images.length);
    if (!available) {
      setError(`Tối đa ${MAX_RECEIPTS} ảnh chứng từ.`);
      return;
    }
    setUploading(true);
    onUploadingChange?.(true);
    setError('');
    const uploaded: string[] = [];
    try {
      for (const file of Array.from(files).slice(0, available)) {
        uploaded.push(await uploadExpenseReceipt(file));
      }
      onChange([...images, ...uploaded]);
    } catch (uploadError) {
      if (uploaded.length) onChange([...images, ...uploaded]);
      setError(uploadError instanceof ApiError ? uploadError.message : 'Không tải được ảnh chứng từ.');
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {images.map((url, index) => (
          <span key={`${url}-${index}`} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
            <a href={url} target="_blank" rel="noreferrer" title={`Mở chứng từ ${index + 1}`} className="block h-full w-full">
              <img src={url} alt={`Chứng từ ${index + 1}`} className="h-full w-full object-cover" />
            </a>
            {!disabled && (
              <button
                type="button"
                title="Bỏ ảnh"
                onClick={() => onChange(images.filter((_, imageIndex) => imageIndex !== index))}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/75 text-white"
              >
                <X size={12} />
              </button>
            )}
          </span>
        ))}
        {images.length < MAX_RECEIPTS && (
          <label className="inline-flex h-16 min-w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-primary/40 bg-blue-50 px-3 text-[11px] font-bold text-primary hover:bg-blue-100">
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
            {uploading ? 'Đang tải...' : 'Thêm chứng từ'}
            <input
              type="file"
              accept={IMAGE_UPLOAD_ACCEPT}
              multiple
              disabled={disabled || uploading}
              onChange={(event) => {
                void uploadFiles(event.currentTarget.files);
                event.currentTarget.value = '';
              }}
              className="hidden"
            />
          </label>
        )}
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">Ảnh biên lai, vé cầu đường hoặc phiếu chi. Tối đa {MAX_RECEIPTS} ảnh.</p>
      {error && <p className="mt-1 text-[11px] font-bold text-red-600">{error}</p>}
    </div>
  );
}

export function ReceiptImageLinks({ images }: { images?: string[] | null }) {
  const urls = Array.isArray(images) ? images.filter(Boolean) : [];
  if (!urls.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1">
      {urls.slice(0, 3).map((url, index) => (
        <a
          key={`${url}-${index}`}
          href={url}
          target="_blank"
          rel="noreferrer"
          title={`Mở chứng từ ${index + 1}`}
          className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-border bg-white text-primary hover:border-primary"
        >
          <img src={url} alt="" className="h-full w-full object-cover" />
        </a>
      ))}
      {urls.length > 3 && <span className="text-[10px] font-bold text-muted-foreground">+{urls.length - 3}</span>}
      <ExternalLink size={12} className="text-muted-foreground" />
    </div>
  );
}
