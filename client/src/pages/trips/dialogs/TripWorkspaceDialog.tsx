import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import TripDetailPage from '../../TripDetailPage';

export default function TripWorkspaceDialog({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 p-2 sm:p-4">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={`Chi tiết chuyến #${tripId}`} tabIndex={-1}
        className="h-full max-h-[96dvh] w-full overflow-hidden rounded-2xl bg-background p-2 shadow-2xl outline-none sm:p-3"
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const controls = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? []).filter((element) => element.getClientRects().length > 0);
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first?.focus();
          }
        }}>
        <TripDetailPage tripId={tripId} onClose={onClose} />
      </div>
    </div>,
    document.body,
  );
}
