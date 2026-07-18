import { CalendarDays, ChevronDown, ChevronRight, Loader2, Printer, Trash2, X } from 'lucide-react';
import { clsx } from 'clsx';
import { Fragment, useMemo, useState } from 'react';
import type { BillListItem } from '../orderFormTypes';

interface Props {
  bills: BillListItem[];
  selectedId: string | null;
  onSelect: (bill: BillListItem) => void;
  onDelete?: (bill: BillListItem) => void;
  canDelete?: boolean;
  isDeleting?: boolean;
  filterDate: string;
  onFilterDateChange: (value: string) => void;
  isLoading?: boolean;
  canLoadMore?: boolean;
  onLoadMore?: () => void;
  onBulkPrint: (billIds: string[]) => void;
  onPrintBill?: (bill: BillListItem) => void;
}

const formatMoney = (value: number) => (value ? value.toLocaleString('vi-VN') : '');
const UNKNOWN_DATE_KEY = '__unknown_date__';

const billMatchesDate = (bill: BillListItem, filterDate: string) => {
  if (!filterDate) return true;
  const source = bill.createdAt || '';
  if (source) {
    const iso = new Date(source).toISOString().slice(0, 10);
    return iso === filterDate;
  }
  const [day, month, year] = bill.date.split('/').map((part) => part.trim());
  if (!day || !month || !year) return false;
  const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return normalized === filterDate;
};

export default function BillListSidebar({
  bills,
  selectedId,
  onSelect,
  onDelete,
  canDelete = false,
  isDeleting = false,
  filterDate,
  onFilterDateChange,
  isLoading = false,
  canLoadMore = false,
  onLoadMore,
  onBulkPrint,
  onPrintBill,
}: Props) {
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({});

  const filteredBills = useMemo(
    () => bills.filter((bill) => billMatchesDate(bill, filterDate)),
    [bills, filterDate],
  );

  const selectedCount = useMemo(
    () => filteredBills.filter((bill) => checkedIds[bill.id]).length,
    [filteredBills, checkedIds],
  );

  const allVisibleChecked = filteredBills.length > 0 && filteredBills.every((bill) => checkedIds[bill.id]);

  const toggleDate = (date: string) => {
    const key = date || UNKNOWN_DATE_KEY;
    setCollapsedDates((current) => ({ ...current, [key]: !current[key] }));
  };

  const toggleBill = (billId: string) => {
    setCheckedIds((current) => ({ ...current, [billId]: !current[billId] }));
  };

  const toggleAllVisible = () => {
    const next = !allVisibleChecked;
    setCheckedIds((current) => {
      const updated = { ...current };
      for (const bill of filteredBills) {
        updated[bill.id] = next;
      }
      return updated;
    });
  };

  const toggleDateGroup = (billIds: string[]) => {
    const allChecked = billIds.every((id) => checkedIds[id]);
    setCheckedIds((current) => {
      const updated = { ...current };
      for (const id of billIds) {
        updated[id] = !allChecked;
      }
      return updated;
    });
  };

  const handleBulkPrint = () => {
    const ids = filteredBills.filter((bill) => checkedIds[bill.id]).map((bill) => bill.id);
    if (!ids.length) return;
    onBulkPrint(ids);
  };

  const columnCount = 7 + (onDelete ? 1 : 0);

  return (
    <aside className="flex w-[700px] shrink-0 flex-col border-l border-slate-300 bg-slate-50/90">
      <div className="border-b border-slate-300 bg-gradient-to-b from-slate-100 to-slate-200 px-2 py-1.5">
        <div className="text-center text-[12px] font-black text-slate-800">Danh sách theo ngày</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <label className="inline-flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-700">
            <CalendarDays size={13} className="shrink-0 text-slate-500" />
            <input
              type="date"
              value={filterDate}
              onChange={(event) => onFilterDateChange(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[11px] font-bold outline-none"
            />
          </label>
          {filterDate && (
            <button
              type="button"
              onClick={() => onFilterDateChange('')}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-extrabold text-slate-600 hover:bg-slate-100"
            >
              <X size={12} />
              Bỏ lọc
            </button>
          )}
          <button
            type="button"
            onClick={handleBulkPrint}
            disabled={selectedCount === 0}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-primary bg-primary px-2.5 text-[11px] font-extrabold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer size={12} />
            In loạt ({selectedCount})
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full min-w-[700px] border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600">
            <tr>
              <th className="w-8 border-b border-r border-slate-300 px-1 py-1.5 text-center font-black">
                <input
                  type="checkbox"
                  checked={allVisibleChecked}
                  onChange={toggleAllVisible}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary"
                  title="Chọn tất cả"
                />
              </th>
              <th className="w-[118px] border-b border-r border-slate-300 px-2 py-1.5 text-left font-black">Số bill</th>
              <th className="w-12 border-b border-r border-slate-300 px-1.5 py-1.5 text-right font-black">Kiện</th>
              <th className="w-16 border-b border-r border-slate-300 px-2 py-1.5 text-left font-black">Nơi đến</th>
              <th className="w-[190px] border-b border-r border-slate-300 px-2 py-1.5 text-left font-black">Khách gửi / Mã KH</th>
              <th className="w-24 border-b border-r border-slate-300 px-2 py-1.5 text-right font-black">Phải thu</th>
              <th className="w-8 border-b border-r border-slate-300 px-1 py-1.5 text-center font-black" title="In bill">In</th>
              {onDelete && <th className="w-7 border-b border-slate-300" />}
            </tr>
          </thead>
          <tbody>
            {filteredBills.map((bill, index) => {
              const active = selectedId === bill.id;
              const previousDate = index > 0 ? filteredBills[index - 1]?.date : '';
              const dateKey = bill.date || UNKNOWN_DATE_KEY;
              const isCollapsed = collapsedDates[dateKey] === true;
              const showDateRow = bill.date !== previousDate;
              const groupBills = showDateRow
                ? filteredBills.filter((item) => (item.date || UNKNOWN_DATE_KEY) === dateKey)
                : [];
              const groupIds = groupBills.map((item) => item.id);
              const groupAllChecked = groupIds.length > 0 && groupIds.every((id) => checkedIds[id]);

              return (
                <Fragment key={bill.id}>
                  {showDateRow && (
                    <tr>
                      <td colSpan={columnCount} className="border-b border-r border-slate-300 bg-slate-200 p-0 text-[11px] font-black text-slate-800">
                        <div className="flex items-center">
                          <label className="flex h-8 w-8 shrink-0 items-center justify-center border-r border-slate-300">
                            <input
                              type="checkbox"
                              checked={groupAllChecked}
                              onChange={() => toggleDateGroup(groupIds)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary"
                              title={`Chọn ngày ${bill.date || 'Không rõ'}`}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => toggleDate(bill.date)}
                            className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left transition-colors hover:bg-slate-300"
                          >
                            {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                            <span>Ngày {bill.date || 'Không rõ'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {!isCollapsed && (
                    <tr className={clsx(active ? 'bg-primary text-white' : 'bg-white hover:bg-blue-50')}>
                      <td className="border-b border-r border-slate-300 px-1 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={Boolean(checkedIds[bill.id])}
                          onChange={() => toggleBill(bill.id)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary"
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                      <td className="border-b border-r border-slate-300 p-0">
                        <button type="button" onClick={() => onSelect(bill)} className="block w-full px-2 py-1.5 text-left font-black">
                          <span className="block truncate">{bill.waybill_code}</span>
                        </button>
                      </td>
                      <td className="border-b border-r border-slate-300 px-1.5 py-1.5 text-right font-black tabular-nums">
                        {bill.package_count}
                      </td>
                      <td className="border-b border-r border-slate-300 px-2 py-1.5 font-bold">
                        <span className="block max-w-14 truncate" title={bill.destination}>{bill.destination || '—'}</span>
                      </td>
                      <td className="border-b border-r border-slate-300 px-2 py-1.5 font-bold">
                        <span className="block max-w-[182px] truncate" title={[bill.senderName, bill.customerCode].filter(Boolean).join(' / ')}>
                          {bill.senderName || '—'}{bill.customerCode ? ` / ${bill.customerCode}` : ''}
                        </span>
                      </td>
                      <td className="border-b border-r border-slate-300 px-2 py-1.5 text-right font-black tabular-nums">
                        {formatMoney(bill.collectOnDelivery)}
                      </td>
                      <td className="border-b border-r border-slate-300 p-0">
                        <button
                          type="button"
                          title={`In ${bill.waybill_code}`}
                          disabled={!onPrintBill}
                          onClick={(event) => {
                            event.stopPropagation();
                            onPrintBill?.(bill);
                          }}
                          className={clsx(
                            'flex h-full min-h-7 w-8 shrink-0 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                            active ? 'text-white hover:bg-blue-600' : 'text-primary hover:bg-blue-50',
                          )}
                        >
                          <Printer size={13} />
                        </button>
                      </td>
                      {onDelete && (
                        <td className="border-b border-slate-300 p-0">
                          <button
                            type="button"
                            title={`Xóa ${bill.waybill_code}`}
                            disabled={!canDelete || isDeleting}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(bill);
                            }}
                            className={clsx(
                              'flex h-full min-h-7 w-7 shrink-0 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                              active ? 'text-white hover:bg-red-500' : 'text-red-500 hover:bg-red-50',
                            )}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      )}
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {filteredBills.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="px-3 py-8 text-center text-[12px] font-semibold text-slate-500">
                  {isLoading
                    ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Đang tải danh sách…</span>
                    : filterDate
                      ? 'Không có đơn trong ngày đã chọn.'
                      : 'Chưa có đơn hàng.'}
                </td>
              </tr>
            )}
            {canLoadMore && !filterDate && (
              <tr>
                <td colSpan={columnCount} className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={onLoadMore}
                    disabled={isLoading || !onLoadMore}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-[11px] font-extrabold text-slate-700 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isLoading && <Loader2 size={12} className="animate-spin" />}
                    Tải thêm đơn
                  </button>
                </td>
              </tr>
            )}
            {Array.from({ length: Math.max(0, 18 - filteredBills.length) }).map((_, index) => (
              <tr key={`empty-${index}`}>
                <td colSpan={columnCount} className="h-7 border-b border-r border-slate-200 bg-white" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </aside>
  );
}
