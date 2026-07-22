import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, ImageOff, Images, Loader2, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { clsx } from 'clsx';

import { ApiError } from '../lib/api';
import { IMAGE_UPLOAD_ACCEPT, uploadWaybillImage } from '../lib/uploadImage';
import { MAX_WAYBILL_IMAGES } from '../lib/waybillImages';
import { ImagePreviewModal } from './ImagePreviewModal';

type UploadStatus = 'uploading' | 'failed';

interface PendingImage {
  id: string;
  file: File;
  fileName: string;
  previewUrl: string;
  status: UploadStatus;
  error: string;
}

interface UploadProgress {
  completed: number;
  total: number;
}

export interface WaybillImagePickerProps {
  value: string[];
  onChange: (urls: string[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
  title?: string;
  description?: string;
  emptyMessage?: string;
  className?: string;
}

const uniqueUrls = (urls: string[]) => [...new Set(urls.map((url) => url.trim()).filter(Boolean))];

const uploadErrorMessage = (error: unknown) => error instanceof ApiError
  ? error.message
  : 'Không upload được ảnh. Vui lòng kiểm tra mạng và thử lại.';

export default function WaybillImagePicker({
  value,
  onChange,
  onUploadingChange,
  disabled = false,
  title = 'Ảnh bill / hàng hóa',
  description = 'Trên điện thoại, dùng Chụp ảnh để mở camera sau hoặc Chọn ảnh để mở thư viện.',
  emptyMessage = 'Chưa có ảnh đính kèm.',
  className,
}: WaybillImagePickerProps) {
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [notice, setNotice] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [brokenUrls, setBrokenUrls] = useState<Set<string>>(() => new Set());
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const valueRef = useRef(value);
  const localPreviewUrlsRef = useRef(new Set<string>());
  const nextIdRef = useRef(0);
  const images = useMemo(
    () => uniqueUrls(value).slice(0, MAX_WAYBILL_IMAGES),
    [value],
  );
  const isUploading = pendingImages.some((item) => item.status === 'uploading');
  const usedSlots = images.length + pendingImages.length;

  useEffect(() => {
    valueRef.current = images;
  }, [images]);

  useEffect(() => {
    onUploadingChange?.(isUploading);
  }, [isUploading, onUploadingChange]);

  useEffect(() => () => {
    if (typeof URL.revokeObjectURL !== 'function') return;
    localPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    localPreviewUrlsRef.current.clear();
  }, []);

  const createPendingImage = useCallback((file: File): PendingImage => {
    const previewUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';
    if (previewUrl) localPreviewUrlsRef.current.add(previewUrl);
    nextIdRef.current += 1;
    return {
      id: `waybill-photo-${Date.now()}-${nextIdRef.current}`,
      file,
      fileName: file.name || `Ảnh ${nextIdRef.current}`,
      previewUrl,
      status: 'uploading',
      error: '',
    };
  }, []);

  const releasePreviewUrl = useCallback((previewUrl: string) => {
    if (!previewUrl || !localPreviewUrlsRef.current.has(previewUrl)) return;
    if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(previewUrl);
    localPreviewUrlsRef.current.delete(previewUrl);
  }, []);

  const finishProgressItem = useCallback(() => {
    setProgress((current) => current
      ? { ...current, completed: Math.min(current.total, current.completed + 1) }
      : current);
  }, []);

  const uploadBatch = useCallback(async (entries: PendingImage[], baseImages: string[]) => {
    const uploadedById = new Map<string, string>();
    setProgress({ completed: 0, total: entries.length });

    await Promise.all(entries.map(async (entry) => {
      try {
        const url = await uploadWaybillImage(entry.file);
        uploadedById.set(entry.id, url);
        const progressiveUrls = entries
          .map((item) => uploadedById.get(item.id))
          .filter((item): item is string => Boolean(item));
        onChange(uniqueUrls([...baseImages, ...progressiveUrls]).slice(0, MAX_WAYBILL_IMAGES));
        setPendingImages((current) => current.filter((item) => item.id !== entry.id));
        releasePreviewUrl(entry.previewUrl);
      } catch (error) {
        setPendingImages((current) => current.map((item) => item.id === entry.id
          ? { ...item, status: 'failed', error: uploadErrorMessage(error) }
          : item));
      } finally {
        finishProgressItem();
      }
    }));

    setProgress(null);
  }, [finishProgressItem, onChange, releasePreviewUrl]);

  const selectFiles = async (files: FileList | null) => {
    if (!files?.length || isUploading || disabled) return;

    const available = MAX_WAYBILL_IMAGES - usedSlots;
    if (available <= 0) {
      setNotice(`Mỗi vận đơn chỉ được gắn tối đa ${MAX_WAYBILL_IMAGES} ảnh.`);
      return;
    }

    const allFiles = Array.from(files);
    const selectedFiles = allFiles.slice(0, available);
    const entries = selectedFiles.map(createPendingImage);
    setPendingImages((current) => [...current, ...entries]);
    setNotice(allFiles.length > selectedFiles.length
      ? `Đã chọn ${selectedFiles.length}/${allFiles.length} ảnh vì giới hạn là ${MAX_WAYBILL_IMAGES} ảnh.`
      : '');
    await uploadBatch(entries, images);
  };

  const retryUpload = async (entry: PendingImage) => {
    if (disabled || isUploading) return;
    setPendingImages((current) => current.map((item) => item.id === entry.id
      ? { ...item, status: 'uploading', error: '' }
      : item));
    setProgress({ completed: 0, total: 1 });
    setNotice('');
    try {
      const url = await uploadWaybillImage(entry.file);
      onChange(uniqueUrls([...valueRef.current, url]).slice(0, MAX_WAYBILL_IMAGES));
      setPendingImages((current) => current.filter((item) => item.id !== entry.id));
      releasePreviewUrl(entry.previewUrl);
    } catch (error) {
      setPendingImages((current) => current.map((item) => item.id === entry.id
        ? { ...item, status: 'failed', error: uploadErrorMessage(error) }
        : item));
    } finally {
      finishProgressItem();
      setProgress(null);
    }
  };

  const removePendingImage = (entry: PendingImage) => {
    if (entry.status === 'uploading') return;
    setPendingImages((current) => current.filter((item) => item.id !== entry.id));
    releasePreviewUrl(entry.previewUrl);
  };

  const clearAll = () => {
    if (disabled || isUploading) return;
    pendingImages.forEach((item) => releasePreviewUrl(item.previewUrl));
    setPendingImages([]);
    setBrokenUrls(new Set());
    setNotice('');
    onChange([]);
  };

  const failedCount = pendingImages.filter((item) => item.status === 'failed').length;
  const progressPercent = progress?.total
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  return (
    <div className={clsx('rounded-lg border border-slate-200 bg-slate-50/70 p-2.5', className)}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12px] font-black text-slate-800">
            <Images size={15} className="shrink-0 text-primary" />
            {title} ({images.length}/{MAX_WAYBILL_IMAGES})
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">{description}</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {(images.length > 0 || pendingImages.length > 0) && (
            <button
              type="button"
              onClick={clearAll}
              disabled={disabled || isUploading}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 text-[11px] font-black text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={13} />
              Xóa tất cả
            </button>
          )}
          {usedSlots < MAX_WAYBILL_IMAGES && (
            <>
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
                    void selectFiles(event.target.files);
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
                    void selectFiles(event.target.files);
                    event.target.value = '';
                  }}
                />
              </label>
            </>
          )}
        </div>
      </div>

      {progress && (
        <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-[11px] font-bold text-blue-800">
            <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />Đang upload ảnh</span>
            <span>{progress.completed}/{progress.total}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-blue-100">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      {notice && <p className="mb-2 text-[11px] font-bold text-amber-700">{notice}</p>}
      {failedCount > 0 && (
        <div className="mb-2 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700" role="alert">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {failedCount} ảnh chưa upload được. Ảnh đã thành công vẫn được giữ; thử lại hoặc xóa ảnh lỗi bên dưới.
        </div>
      )}

      {images.length > 0 || pendingImages.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {images.map((url, index) => {
            const isBroken = brokenUrls.has(url);
            return (
              <div key={`${url}-${index}`} className="group relative h-20 w-24 overflow-hidden rounded-lg border border-slate-200 bg-white">
                {isBroken ? (
                  <div className="flex h-full flex-col items-center justify-center gap-1 bg-slate-100 px-1 text-center text-[10px] font-bold text-slate-600">
                    <ImageOff size={18} className="text-red-500" />
                    Không tải được ảnh
                    <button
                      type="button"
                      onClick={() => setBrokenUrls((current) => {
                        const next = new Set(current);
                        next.delete(url);
                        return next;
                      })}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <RotateCcw size={10} /> Thử lại
                    </button>
                  </div>
                ) : (
                  <button type="button" className="h-full w-full" onClick={() => setPreviewUrl(url)}>
                    <img
                      src={url}
                      alt={`${title} ${index + 1}`}
                      className="h-full w-full object-cover"
                      onError={() => setBrokenUrls((current) => new Set(current).add(url))}
                    />
                  </button>
                )}
                {!disabled && !isUploading && (
                  <button
                    type="button"
                    aria-label={`Xóa ảnh ${index + 1}`}
                    onClick={() => onChange(images.filter((_, imageIndex) => imageIndex !== index))}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-950/75 text-white opacity-90 hover:bg-red-600"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}

          {pendingImages.map((item) => (
            <div key={item.id} className={clsx(
              'relative h-20 w-24 overflow-hidden rounded-lg border bg-white',
              item.status === 'failed' ? 'border-red-300' : 'border-blue-300',
            )}>
              {item.previewUrl ? (
                <img src={item.previewUrl} alt={item.fileName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center bg-slate-100 text-slate-400"><Images size={20} /></div>
              )}
              <div className={clsx(
                'absolute inset-x-0 bottom-0 flex min-h-7 items-center justify-center gap-1 px-1 py-1 text-center text-[10px] font-black text-white',
                item.status === 'failed' ? 'bg-red-700/90' : 'bg-slate-950/75',
              )}>
                {item.status === 'uploading' ? <><Loader2 size={11} className="animate-spin" />Đang tải</> : <><AlertTriangle size={11} />Lỗi upload</>}
              </div>
              {item.status === 'failed' && (
                <div className="absolute inset-x-1 top-1 flex justify-between gap-1">
                  <button
                    type="button"
                    title={item.error}
                    aria-label={`Thử upload lại ${item.fileName}`}
                    onClick={() => void retryUpload(item)}
                    disabled={disabled || isUploading}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-primary shadow hover:bg-blue-50 disabled:opacity-50"
                  >
                    <RotateCcw size={12} />
                  </button>
                  <button
                    type="button"
                    title="Xóa ảnh lỗi"
                    aria-label={`Xóa ảnh lỗi ${item.fileName}`}
                    onClick={() => removePendingImage(item)}
                    disabled={disabled || isUploading}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-red-600 shadow hover:bg-red-50 disabled:opacity-50"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-center text-[11px] font-semibold text-slate-500">
          {emptyMessage}
        </div>
      )}

      <ImagePreviewModal
        imageUrl={previewUrl}
        title={title}
        onClose={() => setPreviewUrl(null)}
      />
    </div>
  );
}
