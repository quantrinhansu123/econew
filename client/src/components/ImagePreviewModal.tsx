import { createPortal } from 'react-dom';
import { ImageIcon, ImageOff, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ImagePreviewModal({
  imageUrl,
  title = 'Chứng từ thanh toán',
  onClose,
}: {
  imageUrl: string | null;
  title?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!imageUrl) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [imageUrl, onClose]);

  if (!imageUrl) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 text-white">
            <ImageIcon size={16} />
            <p className="text-[13px] font-extrabold">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:bg-white/10"
            aria-label="Đóng"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center overflow-auto p-4 custom-scrollbar">
          <PreviewImage key={imageUrl} imageUrl={imageUrl} title={title} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PreviewImage({ imageUrl, title }: { imageUrl: string; title: string }) {
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  if (hasError) {
    return (
      <div className="flex max-w-sm flex-col items-center rounded-2xl border border-red-400/30 bg-white/5 px-6 py-8 text-center text-white" role="alert">
        <ImageOff size={34} className="text-red-300" />
        <p className="mt-3 text-[14px] font-extrabold">Không tải được ảnh</p>
        <p className="mt-1 text-[12px] leading-5 text-white/65">URL ảnh có thể đã hết hạn, bị xóa hoặc mạng đang gián đoạn.</p>
        <button
          type="button"
          onClick={() => {
            setRetryKey((current) => current + 1);
            setHasError(false);
          }}
          className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 text-[12px] font-bold text-white hover:bg-white/15"
        >
          <RotateCcw size={14} />
          Thử tải lại
        </button>
      </div>
    );
  }

  return (
    <img
      key={retryKey}
      src={imageUrl}
      alt={title}
      onError={() => setHasError(true)}
      className="max-h-[78dvh] w-auto max-w-full rounded-lg object-contain"
    />
  );
}

export function ProofImageButton({
  imageUrl,
  label = 'Xem ảnh',
  title,
  className = 'inline-flex items-center gap-1 text-[12px] font-bold text-primary hover:underline',
}: {
  imageUrl?: string | null;
  label?: string;
  title?: string;
  className?: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  if (!imageUrl?.trim()) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setPreviewUrl(imageUrl.trim())}
        className={className}
      >
        <ImageIcon size={14} />
        {label}
      </button>
      <ImagePreviewModal
        imageUrl={previewUrl}
        title={title || label}
        onClose={() => setPreviewUrl(null)}
      />
    </>
  );
}
