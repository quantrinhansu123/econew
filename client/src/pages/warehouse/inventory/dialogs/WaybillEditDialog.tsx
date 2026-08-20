import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import WarehouseOrderNewPage from '../../../WarehouseOrderNewPage';
import type { WaybillInventoryItem } from '../types';

interface Props {
  waybill: WaybillInventoryItem | null;
  onClose: () => void;
  onSaved: (waybillId: string) => void | Promise<void>;
}

export default function WaybillEditDialog({ waybill, onClose, onSaved }: Props) {
  useEffect(() => {
    if (!waybill) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, waybill]);

  if (!waybill) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-2 backdrop-blur-[1px] sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Sửa vận đơn ${waybill.waybill_code || waybill.code || waybill.id}`}
        className="h-[calc(100vh-16px)] w-full max-w-[1500px] overflow-hidden rounded-lg border border-slate-300 bg-slate-100 shadow-2xl sm:h-[calc(100vh-32px)]"
      >
        <WarehouseOrderNewPage
          embeddedWaybillId={String(waybill.id)}
          onEmbeddedClose={onClose}
          onEmbeddedSaved={onSaved}
        />
      </div>
    </div>,
    document.body,
  );
}
