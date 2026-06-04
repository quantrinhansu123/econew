import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Check, ChevronDown, Loader2, Plus, UserPlus } from 'lucide-react';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../../../../lib/api';
import { Command, CommandGroup, CommandItem, CommandList } from '../../../../components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '../../../../components/ui/popover';
import CustomerFormDialog from '../../customers/dialogs/CustomerFormDialog';
import { emptyCustomerForm } from '../../customers/customerFormTypes';
import type { CustomerFormState } from '../../customers/customerFormTypes';
import type { CustomerRecord } from '../../customers/customerFormTypes';
import { formToPayload, validateCustomerForm } from '../../customers/customerFormUtils';
import { customerToOrderPatch } from '../../customers/customerOrderPatch';
import type { CustomerListItem, CustomerListResponse } from '../../customers/types';
import type { HubSummary } from '../types';
import type { NewOrderFormState } from '../orderFormTypes';

interface Props {
  value: string;
  onValueChange: (code: string) => void;
  onCustomerSelect: (patch: Partial<NewOrderFormState>) => void;
  hubs?: HubSummary[];
  disabled?: boolean;
}

const inputClass =
  'h-7 w-full min-w-0 rounded border border-slate-300 bg-white pr-7 pl-2 text-[12px] font-medium text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20';

const normalizeList = (payload: CustomerListResponse | CustomerListItem[]) =>
  Array.isArray(payload) ? payload : payload.items || [];

export default function CustomerMaKhCombobox({
  value,
  onValueChange,
  onCustomerSelect,
  hubs = [],
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [options, setOptions] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const fetchSeqRef = useRef(0);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CustomerFormState>(emptyCustomerForm);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const fetchCustomers = useCallback(async (keyword: string): Promise<CustomerListItem[]> => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setFetchError('');
    try {
      const params = new URLSearchParams({ page: '1', limit: '100' });
      if (keyword.trim()) params.set('keyword', keyword.trim());
      const response = await apiRequest<CustomerListResponse>(`/customers?${params.toString()}`);
      const items = normalizeList(response);
      if (seq !== fetchSeqRef.current) return items;
      setOptions(items);
      return items;
    } catch (err: unknown) {
      if (seq !== fetchSeqRef.current) return [];
      setOptions([]);
      setFetchError(err instanceof ApiError ? err.message : 'Không tải được danh sách khách hàng.');
      return [];
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCustomers('');
  }, [fetchCustomers]);

  const scheduleFetch = (keyword: string) => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => void fetchCustomers(keyword), 280);
  };

  const trimmedQuery = inputValue.trim();
  const queryUpper = trimmedQuery.toUpperCase();

  /** Kết quả từ API (đã lọc server); chỉ giới hạn số dòng hiển thị */
  const displayOptions = useMemo(() => options.slice(0, 50), [options]);

  const hasExactCode = displayOptions.some((c) => c.code.toUpperCase() === queryUpper);
  const showAddNew = trimmedQuery.length > 0 && !hasExactCode && !loading;

  const applyCustomer = useCallback(
    async (customer: CustomerListItem) => {
      setInputValue(customer.code);
      onValueChange(customer.code);
      try {
        const full = await apiRequest<CustomerRecord>(`/customers/${customer.id}`);
        onCustomerSelect(customerToOrderPatch({ ...customer, ...full }, hubs));
      } catch {
        onCustomerSelect(customerToOrderPatch(customer, hubs));
      }
      setOpen(false);
    },
    [hubs, onCustomerSelect, onValueChange],
  );

  const commitTypedCode = async (code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    setInputValue(normalized);
    onValueChange(normalized);
    setOpen(false);
    let match = options.find((c) => c.code.toUpperCase() === normalized);
    if (!match) {
      const fresh = await fetchCustomers(normalized);
      match = fresh.find((c) => c.code.toUpperCase() === normalized);
    }
    if (match) await applyCustomer(match);
  };

  const openCreateModal = () => {
    const q = trimmedQuery || value.trim();
    const upper = q.toUpperCase();
    const isCodeLike = Boolean(q) && !/\s/.test(q);
    setForm({
      ...emptyCustomerForm(),
      code: isCodeLike ? upper : '',
      name: !isCodeLike && q ? q : '',
    });
    setFormError('');
    setFormOpen(true);
    setOpen(false);
  };

  const submitNewCustomer = async () => {
    const validation = validateCustomerForm(form, false);
    if (validation) {
      setFormError(validation);
      return;
    }
    setIsSubmitting(true);
    setFormError('');
    try {
      const created = await apiRequest<CustomerRecord>('/customers', {
        method: 'POST',
        body: formToPayload(form, false),
      });
      setFormOpen(false);
      await fetchCustomers(created.code);
      await applyCustomer({ ...created, waybill_count: 0 } as CustomerListItem);
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Không tạo được khách hàng.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const preventBlurForPointer = (e: PointerEvent) => {
    e.preventDefault();
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      if (containerRef.current?.contains(document.activeElement)) return;
      const popover = document.querySelector('[data-ma-kh-popover]');
      if (popover?.contains(document.activeElement)) return;
      setOpen(false);
      if (trimmedQuery) void commitTypedCode(trimmedQuery);
    }, 200);
  };

  return (
    <>
      <div className="flex min-w-0 w-full items-center gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverAnchor asChild>
            <div ref={containerRef} className="relative flex min-w-0 flex-1 items-center">
            <input
              type="text"
              disabled={disabled}
              value={inputValue}
              onChange={(e) => {
                const next = e.target.value;
                setInputValue(next);
                onValueChange(next.toUpperCase());
                setOpen(true);
                scheduleFetch(next);
              }}
              onFocus={() => {
                setOpen(true);
                void fetchCustomers(inputValue);
              }}
              onBlur={handleBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && trimmedQuery) {
                  e.preventDefault();
                  if (displayOptions[0] && !showAddNew) void applyCustomer(displayOptions[0]);
                  else if (showAddNew) openCreateModal();
                  else void commitTypedCode(trimmedQuery);
                }
                if (e.key === 'Escape') setOpen(false);
              }}
              placeholder="Gõ mã hoặc tên KH..."
              className={inputClass}
            />
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              onClick={() => setOpen((p) => !p)}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ChevronDown size={14} className={clsx(open && 'rotate-180')} />
              )}
            </button>
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          data-ma-kh-popover
          className="z-[10000] w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0 shadow-lg border-border"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onPointerDown={preventBlurForPointer}
        >
          <Command shouldFilter={false} className="rounded-lg">
            <CommandList className="max-h-52 p-1">
              {fetchError ? (
                <div className="px-2 py-3 text-center text-[12px] text-destructive">{fetchError}</div>
              ) : null}
              {loading && displayOptions.length === 0 && !fetchError ? (
                <div className="flex items-center justify-center gap-2 py-4 text-[12px] text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                  Đang tìm...
                </div>
              ) : null}
              {!loading && !fetchError && displayOptions.length === 0 && !showAddNew ? (
                <div className="px-2 py-3 text-center text-[12px]">
                  <p className="text-muted-foreground">Không có khách hàng phù hợp</p>
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="mt-2 inline-flex items-center gap-1 font-bold text-primary hover:underline"
                  >
                    <UserPlus size={13} />
                    Thêm khách hàng mới
                  </button>
                </div>
              ) : null}
              {displayOptions.length > 0 && (
                <CommandGroup heading="Khách hàng" className="text-[10px]">
                  {displayOptions.map((customer) => (
                    <CommandItem
                      key={customer.id}
                      value={customer.code}
                      onPointerDown={preventBlurForPointer}
                      onSelect={() => void applyCustomer(customer)}
                      className={clsx(
                        'flex cursor-pointer flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-[12px]',
                        value.toUpperCase() === customer.code.toUpperCase() && 'bg-primary/10',
                      )}
                    >
                      <span className="flex w-full items-center justify-between font-bold text-primary">
                        {customer.code}
                        {value.toUpperCase() === customer.code.toUpperCase() && <Check size={14} />}
                      </span>
                      <span className="font-medium text-foreground">{customer.name}</span>
                      {customer.short_name && customer.short_name !== customer.name && (
                        <span className="text-[11px] text-muted-foreground">{customer.short_name}</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {showAddNew && (
                <CommandGroup>
                  <CommandItem
                    onPointerDown={preventBlurForPointer}
                    onSelect={openCreateModal}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-[12px] font-bold text-primary"
                  >
                    <UserPlus size={14} />
                    Thêm khách hàng mới
                    {queryUpper ? ` (${queryUpper})` : ''}
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
        </Popover>

        <button
          type="button"
          title="Thêm khách hàng mới"
          disabled={disabled || isSubmitting}
          onClick={openCreateModal}
          className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded border border-primary bg-primary px-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={13} strokeWidth={2.5} />
          <span className="whitespace-nowrap">Thêm mới</span>
        </button>
      </div>

      <CustomerFormDialog
        isOpen={formOpen}
        isEdit={false}
        isSubmitting={isSubmitting}
        error={formError}
        form={form}
        onClose={() => setFormOpen(false)}
        onSubmit={() => void submitNewCustomer()}
        onChange={(key, val) => setForm((prev) => ({ ...prev, [key]: val }))}
      />
    </>
  );
}
