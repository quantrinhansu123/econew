import { useEffect, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import { clsx } from 'clsx';
import SplitOrderDialog from './dialogs/SplitOrderDialog';

interface VehicleManifestButtonProps {
  className?: string;
}

export default function VehicleManifestButton({ className }: VehicleManifestButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
  }, []);

  const open = () => {
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    setIsClosing(false);
    setIsOpen(true);
  };

  const close = () => {
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      closeTimerRef.current = null;
    }, 180);
  };

  return (
    <>
      <button
        type="button"
        title="Bảng kê phát hàng — xe và vị trí"
        onClick={open}
        className={clsx(
          'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-[13px] font-bold text-violet-800 hover:bg-violet-100',
          className,
        )}
      >
        <Layers size={16} />
        <span className="hidden sm:inline">Bảng kê xe</span>
      </button>
      <SplitOrderDialog isOpen={isOpen} isClosing={isClosing} waybill={null} onClose={close} />
    </>
  );
}
