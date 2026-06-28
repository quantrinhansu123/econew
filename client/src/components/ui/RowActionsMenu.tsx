import { clsx } from 'clsx';
import { MoreVertical } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function RowActionsMenu({
  label = 'Mở thao tác',
  align = 'right',
  children,
}: {
  label?: string;
  align?: 'left' | 'right';
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const close = () => setIsOpen(false);

  return (
    <div ref={menuRef} className="relative inline-block text-left">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-label={label}
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
      >
        <MoreVertical size={16} />
      </button>
      {isOpen && (
        <div
          className={clsx(
            'absolute z-30 mt-1.5 min-w-[10.5rem] overflow-hidden rounded-xl border border-border bg-white p-1.5 shadow-xl shadow-slate-900/10',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <div onClick={close}>{children}</div>
        </div>
      )}
    </div>
  );
}

export function RowActionsMenuItem({
  icon,
  label,
  onClick,
  disabled,
  title,
  tone,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  tone?: 'primary' | 'amber' | 'emerald' | 'danger';
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title || label}
      onClick={onClick}
      className={clsx(
        'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        tone === 'danger' && 'text-red-600 hover:bg-red-50',
        tone === 'amber' && 'text-amber-700 hover:bg-amber-50',
        tone === 'emerald' && 'text-emerald-700 hover:bg-emerald-50',
        tone === 'primary' && 'text-primary hover:bg-blue-50',
        !tone && 'text-foreground hover:bg-muted',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
