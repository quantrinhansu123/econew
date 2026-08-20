import { useEffect, useState } from 'react';
import { WalletCards } from 'lucide-react';
import { ApiError, apiRequest } from '../../lib/api';
import { formatMoney } from '../../lib/formatMoney';

export interface CashFundOption {
  id: string | number;
  code?: string | null;
  name?: string | null;
  balance_amount?: number | string | null;
  is_active?: boolean;
  hub?: { code?: string | null; name?: string | null } | null;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

const normalizeFunds = (response: CashFundOption[] | { items?: CashFundOption[]; data?: CashFundOption[] }) => (
  Array.isArray(response) ? response : response.items || response.data || []
);

export default function CashFundSelect({ value, onChange, disabled = false, label = 'Sổ quỹ', className = '' }: Props) {
  const [funds, setFunds] = useState<CashFundOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      apiRequest<CashFundOption[] | { items?: CashFundOption[]; data?: CashFundOption[] }>('/finance/cash-funds')
        .then((response) => {
          if (cancelled) return;
          setFunds(normalizeFunds(response).filter((fund) => fund.is_active !== false));
          setError('');
        })
        .catch((requestError) => {
          if (cancelled) return;
          setFunds([]);
          setError(requestError instanceof ApiError ? requestError.message : 'Không tải được sổ quỹ.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <label className={`block ${className}`.trim()}>
      <span className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase text-muted-foreground">
        <WalletCards size={13} /> {label} <b className="text-red-500">*</b>
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || loading}
        className="h-11 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-bold outline-none focus:border-primary disabled:bg-muted/20 disabled:text-muted-foreground"
      >
        <option value="">{loading ? 'Đang tải sổ quỹ...' : 'Chọn sổ quỹ'}</option>
        {funds.map((fund) => (
          <option key={String(fund.id)} value={String(fund.id)}>
            {[fund.code, fund.name, fund.hub?.code].filter(Boolean).join(' · ')} · {formatMoney(fund.balance_amount, { empty: '0 đ' })}
          </option>
        ))}
      </select>
      {error && <span className="mt-1 block text-[11px] font-bold text-red-600">{error}</span>}
    </label>
  );
}
