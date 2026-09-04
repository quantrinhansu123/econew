import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface InlineTextInputProps {
  value?: string | null;
  editable: boolean;
  label?: string;
  onSave: (value: string) => Promise<void>;
  toneClassName?: string;
  placeholder?: string;
}

export default function InlineTextInput({
  value,
  editable,
  label,
  onSave,
  toneClassName = 'text-foreground',
  placeholder = '',
}: InlineTextInputProps) {
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!savingRef.current) setDraft(value || '');
  }, [value]);

  if (!editable) return <>{value || '—'}</>;

  const reset = () => {
    setDraft(value || '');
    setFailed(false);
  };

  const commit = async () => {
    const nextValue = draft.trim();
    if (savingRef.current || nextValue === (value || '').trim()) return;
    savingRef.current = true;
    setSaving(true);
    setFailed(false);
    try {
      await onSave(nextValue);
      setDraft(nextValue);
    } catch {
      reset();
      setFailed(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="relative min-w-[112px]" onClick={(event) => event.stopPropagation()}>
      <input
        type="text"
        aria-label={label}
        title="Nhập trực tiếp, nhấn Enter hoặc Tab để lưu"
        value={draft}
        disabled={saving}
        placeholder={placeholder}
        onChange={(event) => {
          setDraft(event.target.value);
          setFailed(false);
        }}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            reset();
            event.currentTarget.blur();
          }
        }}
        className={`h-8 w-full rounded-md border bg-white py-1 px-2 text-left text-[12px] outline-none transition-colors focus:ring-2 focus:ring-primary/15 disabled:bg-slate-50 ${
          failed ? 'border-red-400 text-red-700' : `border-transparent hover:border-slate-300 focus:border-primary ${toneClassName}`
        }`}
      />
      {saving && <Loader2 size={13} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-primary" />}
    </div>
  );
}
