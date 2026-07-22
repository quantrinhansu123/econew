import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Phone } from 'lucide-react';
import { apiRequest } from '../../../../lib/api';
import { Popover, PopoverAnchor, PopoverContent } from '../../../../components/ui/popover';
import { CompactInput } from './CompactField';

export interface ReceiverContactSuggestion {
  phone: string;
  receiver_address: string;
  receiver_name?: string | null;
  receiver_company_name?: string | null;
  last_used_at?: string | null;
}

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (contact: ReceiverContactSuggestion) => void;
  disabled?: boolean;
}

export default function ReceiverPhoneCombobox({
  value,
  onValueChange,
  onSelect,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<ReceiverContactSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<number | null>(null);
  const requestSeqRef = useRef(0);

  const fetchSuggestions = useCallback(async (phone: string) => {
    const requestSeq = ++requestSeqRef.current;
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ limit: '12' });
      if (phone.trim()) query.set('phone', phone.trim());
      const result = await apiRequest<ReceiverContactSuggestion[]>(`/waybills/receiver-contacts?${query.toString()}`);
      if (requestSeq === requestSeqRef.current) setSuggestions(result);
    } catch {
      if (requestSeq === requestSeqRef.current) {
        setSuggestions([]);
        setError('Không tải được danh bạ người nhận.');
      }
    } finally {
      if (requestSeq === requestSeqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
  }, []);

  const scheduleFetch = (phone: string) => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => void fetchSuggestions(phone), 250);
  };

  const chooseContact = (contact: ReceiverContactSuggestion) => {
    onValueChange(contact.phone);
    onSelect(contact);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative min-w-0">
          <CompactInput
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={value}
            disabled={disabled}
            onFocus={() => {
              setOpen(true);
              void fetchSuggestions(value);
            }}
            onChange={(event) => {
              const next = event.target.value;
              onValueChange(next);
              setOpen(true);
              scheduleFetch(next);
            }}
            placeholder="Nhập SĐT để tìm địa chỉ"
            className="pr-7"
          />
          {loading ? (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-primary" size={13} />
          ) : (
            <Phone className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
          )}
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        className="z-[10000] w-[360px] max-w-[calc(100vw-24px)] overflow-hidden border-border p-0 shadow-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerDown={(event) => event.preventDefault()}
      >
        <div className="border-b border-border bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-700">Danh bạ người nhận</p>
          <p className="mt-0.5 text-[10px] font-medium text-slate-500">Chọn số để điền địa chỉ đã lưu gần nhất</p>
        </div>

        <div className="custom-scrollbar max-h-64 overflow-y-auto p-1.5">
          {error ? (
            <p className="px-2 py-3 text-center text-[11px] font-semibold text-red-600">{error}</p>
          ) : loading && suggestions.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-2 py-4 text-[11px] font-semibold text-slate-500">
              <Loader2 className="animate-spin" size={14} />
              Đang tìm số điện thoại...
            </div>
          ) : suggestions.length === 0 ? (
            <p className="px-2 py-3 text-center text-[11px] font-semibold text-slate-500">
              Chưa có địa chỉ đã lưu cho số này.
            </p>
          ) : (
            suggestions.map((contact) => (
              <button
                key={contact.phone}
                type="button"
                onClick={() => chooseContact(contact)}
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-primary">
                  <MapPin size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-black tabular-nums text-slate-900">{contact.phone}</span>
                  <span className="mt-0.5 block text-[11px] font-medium leading-snug text-slate-600">{contact.receiver_address}</span>
                  {(contact.receiver_company_name || contact.receiver_name) && (
                    <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-400">
                      {[contact.receiver_company_name, contact.receiver_name].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
