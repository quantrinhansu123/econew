import clsx from 'clsx';
import {
  ALL_ORDERS_FINANCIAL_COLUMN_IDS,
  ALL_ORDERS_PREFIX_COLUMN_IDS,
  ALL_ORDERS_SENDER_COLUMN_IDS,
  ALL_ORDERS_SUFFIX_COLUMN_IDS,
  type InventoryColumnView,
} from './inventoryColumns';

interface Props {
  columns: InventoryColumnView[];
  selectionEnabled?: boolean;
  allRowsSelected?: boolean;
  onToggleSelectAll?: () => void;
}

export default function AllOrdersTableHeader({
  columns,
  selectionEnabled,
  allRowsSelected,
  onToggleSelectAll,
}: Props) {
  const prefixColumns = columns.filter((col) => ALL_ORDERS_PREFIX_COLUMN_IDS.includes(col.id));
  const senderColumns = columns.filter((col) => ALL_ORDERS_SENDER_COLUMN_IDS.includes(col.id));
  const financialColumns = columns.filter((col) => ALL_ORDERS_FINANCIAL_COLUMN_IDS.includes(col.id));
  const otherColumns = columns.filter(
    (col) =>
      !ALL_ORDERS_PREFIX_COLUMN_IDS.includes(col.id) &&
      !ALL_ORDERS_SENDER_COLUMN_IDS.includes(col.id) &&
      !ALL_ORDERS_FINANCIAL_COLUMN_IDS.includes(col.id) &&
      ALL_ORDERS_SUFFIX_COLUMN_IDS.includes(col.id),
  );

  return (
    <>
      <tr className="text-[11px] uppercase tracking-wider">
        {selectionEnabled && (
          <th rowSpan={2} className="w-10 border-b border-r border-border bg-slate-100 px-2 py-2 font-bold text-center">
            <input
              type="checkbox"
              checked={Boolean(allRowsSelected)}
              onChange={onToggleSelectAll}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
              aria-label="Chọn tất cả"
            />
          </th>
        )}
        {prefixColumns.map((col) => (
          <th
            key={col.id}
            rowSpan={2}
            className="border-b border-r border-border bg-slate-100 px-3 py-2.5 font-bold text-slate-600 whitespace-nowrap w-12 text-center"
          >
            {col.label}
          </th>
        ))}
        {senderColumns.length > 0 && (
          <th
            colSpan={senderColumns.length}
            className="border-b border-r border-border bg-sky-100 px-4 py-2 font-extrabold text-sky-900 text-center"
          >
            Thông tin người gửi
          </th>
        )}
        {financialColumns.length > 0 && (
          <th
            colSpan={financialColumns.length}
            className="border-b border-r border-border bg-violet-50 px-4 py-2 font-extrabold text-violet-900 text-center"
          >
            &nbsp;
          </th>
        )}
        {otherColumns.map((col) => (
          <th
            key={col.id}
            rowSpan={2}
            className="border-b border-r border-border bg-slate-100 px-4 py-2 font-bold text-slate-600 last:border-r-0 whitespace-nowrap"
          >
            {col.label}
          </th>
        ))}
      </tr>
      <tr className="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600">
        {senderColumns.map((col) => (
          <th
            key={col.id}
            className="border-b border-r border-border px-4 py-2.5 font-bold whitespace-nowrap"
          >
            {col.label}
          </th>
        ))}
        {financialColumns.map((col) => (
          <th
            key={col.id}
            className={clsx(
              'border-b border-r border-border px-4 py-2.5 font-bold whitespace-nowrap',
              col.headerClass,
            )}
          >
            {col.label}
          </th>
        ))}
      </tr>
    </>
  );
}
