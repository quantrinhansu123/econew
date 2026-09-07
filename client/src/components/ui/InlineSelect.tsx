import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

export interface InlineSelectOption {
  value: string;
  label: string;
}

interface InlineSelectProps {
  value?: string | null;
  options: (InlineSelectOption | string)[];
  editable: boolean;
  label?: string;
  onSave: (value: string) => Promise<void>;
  toneClassName?: string;
  className?: string;
}

export default function InlineSelect({
  value,
  options,
  editable,
  label,
  onSave,
  toneClassName = 'text-foreground',
  className,
}: InlineSelectProps) {
  const normalizedOptions: InlineSelectOption[] = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt,
  );

  const currentValue = value || '';
  const hasValueInOptions = normalizedOptions.some((opt) => opt.value === currentValue);
  const displayOptions = hasValueInOptions || !currentValue
    ? normalizedOptions
    : [{ value: currentValue, label: currentValue }, ...normalizedOptions];

  const [draft, setDraft] = useState(currentValue);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!savingRef.current) {
      setDraft(value || '');
    }
  }, [value]);

  if (!editable) {
    const selectedOption = displayOptions.find((opt) => opt.value === (value || ''));
    return <>{selectedOption ? selectedOption.label : value || '—'}</>;
  }

  const handleChange = async (nextValue: string) => {
    if (savingRef.current || nextValue === (value || '')) return;
    const prevValue = draft;
    savingRef.current = true;
    setSaving(true);
    setFailed(false);
    setDraft(nextValue);

    try {
      await onSave(nextValue);
    } catch {
      setDraft(prevValue);
      setFailed(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div
      className={clsx('relative inline-flex w-full min-w-[76px] items-center', className)}
      onClick={(event) => event.stopPropagation()}
    >
      <select
        aria-label={label}
        value={draft}
        disabled={saving}
        onChange={(event) => void handleChange(event.target.value)}
        className={clsx(
          'h-7 w-full appearance-none rounded border py-0.5 pl-2 pr-6 text-left text-[12px] font-medium outline-none transition-colors cursor-pointer',
          saving && 'opacity-60 cursor-wait',
          failed
            ? 'border-red-400 bg-red-50 text-red-700'
            : 'border-slate-200 bg-white hover:border-slate-300 focus:border-primary focus:ring-2 focus:ring-primary/15',
          toneClassName,
        )}
      >
        {displayOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400">
        {saving ? (
          <Loader2 size={13} className="animate-spin text-primary" />
        ) : (
          <ChevronDown size={14} />
        )}
      </div>
    </div>
  );
}
