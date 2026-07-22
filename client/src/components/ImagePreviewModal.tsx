import { createPortal } from 'react-dom';
import { ImageIcon, X } from 'lucide-react';
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
          <img
            src={imageUrl}
            alt={title}
            className="max-h-[78dvh] w-auto max-w-full rounded-lg object-contain"
          />
        </div>
      </div>
    </div>,
    document.body,
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
