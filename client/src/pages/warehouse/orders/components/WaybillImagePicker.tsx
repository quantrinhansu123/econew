import { useState } from 'react';
import { Camera, Images, Loader2, Plus, X } from 'lucide-react';
import { ImagePreviewModal } from '../../../../components/ImagePreviewModal';
import { ApiError } from '../../../../lib/api';
import { IMAGE_UPLOAD_ACCEPT, uploadWaybillImage } from '../../../../lib/uploadImage';
import { MAX_WAYBILL_IMAGES } from '../../../../lib/waybillImages';

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
}

export default function WaybillImagePicker({ value, onChange, onUploadingChange, disabled }: Props) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const images = value.slice(0, MAX_WAYBILL_IMAGES);

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length || isUploading || disabled) return;
    const available = MAX_WAYBILL_IMAGES - images.length;
    const selected = Array.from(files).slice(0, available);
    if (!selected.length) {
      setError(`Mỗi bill chỉ được gắn tối đa ${MAX_WAYBILL_IMAGES} ảnh.`);
      return;
    }

    setIsUploading(true);
    onUploadingChange?.(true);
    setError('');
    try {
      const uploaded: string[] = [];
      let firstFailure = '';
      for (const file of selected) {
        try {
          uploaded.push(await uploadWaybillImage(file));
        } catch (uploadError) {
          if (!firstFailure) {
            firstFailure = uploadError instanceof ApiError
              ? uploadError.message
              : 'Có ảnh không upload được.';
          }
        }
      }
      if (uploaded.length) onChange([...images, ...uploaded].slice(0, MAX_WAYBILL_IMAGES));
      if (firstFailure) setError(firstFailure);
    } finally {
      setIsUploading(false);
      onUploadingChange?.(false);
    }
  };

  return (
    <div className="col-span-12 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-[12px] font-black text-slate-800">
            <Images size={15} className="text-primary" />
            Ảnh bill / hàng hóa ({images.length}/{MAX_WAYBILL_IMAGES})
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
            Trên điện thoại chọn Chụp ảnh để mở camera sau; ảnh này đồng thời dùng làm ảnh báo phát.
          </p>
        </div>
        {images.length < MAX_WAYBILL_IMAGES && (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-[11px] font-black text-primary hover:bg-blue-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
              {isUploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
              {isUploading ? 'Đang tải...' : 'Chụp ảnh'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={disabled || isUploading}
                onChange={(event) => {
                  void uploadFiles(event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-[11px] font-black text-primary hover:bg-blue-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
              <Plus size={13} />
              Chọn ảnh
              <input
                type="file"
                accept={IMAGE_UPLOAD_ACCEPT}
                multiple
                className="hidden"
                disabled={disabled || isUploading}
                onChange={(event) => {
                  void uploadFiles(event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
          </div>
        )}
      </div>

      {error && <p className="mb-2 text-[11px] font-bold text-red-600">{error}</p>}
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {images.map((url, index) => (
            <div key={url} className="group relative h-16 w-20 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <button type="button" className="h-full w-full" onClick={() => setPreviewUrl(url)}>
                <img src={url} alt={`Ảnh bill ${index + 1}`} className="h-full w-full object-cover" />
              </button>
              {!disabled && !isUploading && (
                <button
                  type="button"
                  aria-label={`Xóa ảnh ${index + 1}`}
                  onClick={() => onChange(images.filter((item) => item !== url))}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-950/75 text-white opacity-90 hover:bg-red-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-center text-[11px] font-semibold text-slate-500">
          Chưa có ảnh đính kèm.
        </div>
      )}

      <ImagePreviewModal
        imageUrl={previewUrl}
        title="Ảnh bill / hàng hóa"
        onClose={() => setPreviewUrl(null)}
      />
    </div>
  );
}
