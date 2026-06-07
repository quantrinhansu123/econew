import { Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { BillListItem } from '../orderFormTypes';

interface Props {
  bills: BillListItem[];
  selectedId: string | null;
  onSelect: (bill: BillListItem) => void;
  onDelete?: (bill: BillListItem) => void;
  canDelete?: boolean;
  isDeleting?: boolean;
}

export default function BillListSidebar({
  bills,
  selectedId,
  onSelect,
  onDelete,
  canDelete = false,
  isDeleting = false,
}: Props) {
  return (
    <aside className="flex w-[200px] shrink-0 flex-col border-l border-slate-300 bg-slate-50">
      <div className="border-b border-slate-300 bg-slate-100 px-2 py-2 text-center text-[13px] font-extrabold text-slate-800">
        Số bill
      </div>
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            {bills.map((bill) => {
              const active = selectedId === bill.id;
              return (
                <tr key={bill.id}>
                  <td className="border-b border-r border-slate-300 p-0">
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() => onSelect(bill)}
                        className={clsx(
                          'flex min-w-0 flex-1 items-center gap-1.5 px-2 py-2 text-left font-bold transition-colors',
                          active ? 'bg-primary text-white' : 'bg-white text-foreground hover:bg-blue-50',
                        )}
                      >
                        <span className={clsx('shrink-0 tabular-nums', active ? 'text-white/90' : 'text-muted-foreground')}>
                          {bill.package_count}
                        </span>
                        <span className="min-w-0 truncate">{bill.waybill_code}</span>
                      </button>
                      {onDelete && (
                        <button
                          type="button"
                          title={`Xóa ${bill.waybill_code}`}
                          disabled={!canDelete || isDeleting}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(bill);
                          }}
                          className={clsx(
                            'flex w-8 shrink-0 items-center justify-center border-l border-slate-300 transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                            active
                              ? 'bg-primary text-white hover:bg-red-500'
                              : 'bg-white text-red-500 hover:bg-red-50',
                          )}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {Array.from({ length: Math.max(0, 18 - bills.length) }).map((_, index) => (
              <tr key={`empty-${index}`}>
                <td className="h-8 border-b border-r border-slate-200 bg-white" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </aside>
  );
}
