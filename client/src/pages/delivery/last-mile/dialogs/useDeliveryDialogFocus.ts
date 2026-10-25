import { useEffect, useLayoutEffect, useRef } from 'react';

export function useDeliveryDialogFocus(open: boolean, onClose: () => void, busy = false) {
  const panel = useRef<HTMLElement>(null);
  const action = useRef({ onClose, busy });
  useLayoutEffect(() => { action.current = { onClose, busy }; }, [onClose, busy]);
  useEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => [...element.querySelectorAll<HTMLElement>('button:enabled, input:enabled, select:enabled, textarea:enabled, a[href], [tabindex="0"]')]
      .filter(item => item.getClientRects().length > 0);
    (controls()[0] || element).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!action.current.busy) action.current.onClose();
      } else if (event.key === 'Tab') {
        const items = controls();
        const first = items[0];
        const last = items.at(-1);
        if (!first || !element.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last || element : first || element).focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); if (previous?.isConnected) previous.focus(); };
  }, [open]);
  return panel;
}
