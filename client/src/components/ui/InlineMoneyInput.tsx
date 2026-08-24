import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  formatAmountInput,
  formatAmountInputFromNumber,
  formatMoney,
  normalizeMoney,
  parseAmountInput,
} from '../../lib/formatMoney';

interface InlineMoneyInputProps {
  value?: number | string | null;
  editable: boolean;
  label: string;
  onSave: (amount: number) => Promise<void>;
  toneClassName?: string;
}

const formatDraftAmount = (value?: number | string | null) => formatAmountInputFromNumber(value) || '0';

export default function InlineMoneyInput({
  value,
  editable,
  label,
  onSave,
  toneClassName = 'text-foreground',
}: InlineMoneyInputProps) {
  const amount = normalizeMoney(value);
  const [draft, setDraft] = useState(() => formatDraftAmount(amount));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!savingRef.current) setDraft(formatDraftAmount(amount));
  }, [amount]);

  if (!editable) return <>{formatMoney(amount)}</>;

  const reset = () => {
    setDraft(formatDraftAmount(amount));
    setFailed(false);
  };

  const commit = async () => {
    const nextAmount = parseAmountInput(draft);
    if (savingRef.current || nextAmount === amount) return;
    savingRef.current = true;
    setSaving(true);
    setFailed(false);
    try {
      await onSave(nextAmount);
      setDraft(formatDraftAmount(nextAmount));
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
        inputMode="numeric"
        aria-label={label}
        title="Nhập trực tiếp, nhấn Enter hoặc Tab để lưu"
        value={draft}
        disabled={saving}
        onChange={(event) => {
          setDraft(formatAmountInput(event.target.value));
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
        className={`h-8 w-full rounded-md border bg-white py-1 pl-2 pr-7 text-right text-[12px] font-extrabold tabular-nums outline-none transition-colors focus:ring-2 focus:ring-primary/15 disabled:bg-slate-50 ${
          failed ? 'border-red-400 text-red-700' : `border-transparent hover:border-slate-300 focus:border-primary ${toneClassName}`
        }`}
      />
      {saving && <Loader2 size={13} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-primary" />}
    </div>
  );
}
