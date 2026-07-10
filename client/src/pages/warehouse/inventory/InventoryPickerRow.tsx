import { Fragment } from 'react';
import { clsx } from 'clsx';
import type { InventoryColumnDef, InventoryColumnId } from './inventoryColumns';
import {
  getStorageAgeRowClass,
  formatInventoryDate,
  resolveFreight,
  resolveCustomerName,
  resolveServiceType,
  resolveBillingUnit,
  resolveUnitPrice,
  resolveTransitFee,
  resolvePaymentMethod,
  resolveLoadedAt,
  resolveMaKh,
  resolveNoiDen,
  resolveReceiverAddress,
  resolveReceiverPhone,
  resolveRoute,
  resolveVolumeM3,
  resolveWeightKg,
} from './inventoryColumns';
import type { WaybillInventoryItem } from './types';

const displayCode = (waybill: WaybillInventoryItem) => waybill.waybill_code || waybill.code || `#${waybill.id}`;
const displayValue = (value: unknown, suffix = '') =>
  value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`;
const formatDate = (value?: string | null) => (value ? formatInventoryDate(value) : '—');
const formatHub = (
  hub?: { id?: string | number; code?: string | null; name?: string | null } | null,
  fallback?: string | number | null,
) => (hub ? [hub.code?.toUpperCase(), hub.name].filter(Boolean).join(' · ') || `Hub #${hub.id}` : fallback ? `Hub #${fallback}` : '—');

function renderCell(
  waybill: WaybillInventoryItem,
  colId: InventoryColumnId,
  canViewPricing: boolean,
) {
  const cellClass = 'px-4 py-3 border-r border-border text-[13px] max-w-[220px]';

  switch (colId) {
    case 'stack_position':
      return (
        <td className={`${cellClass} min-w-[72px] text-muted-foreground`}>
          {waybill.loading_position ? String(waybill.loading_position) : '—'}
        </td>
      );
    case 'order_code':
      return <td className={`${cellClass} font-bold text-violet-800`}>{waybill.order_code || '—'}</td>;
    case 'waybill_code':
      return <td className={`${cellClass} font-extrabold text-primary`}>{displayCode(waybill)}</td>;
    case 'customer_name':
      return <td className={cellClass}>{resolveCustomerName(waybill)}</td>;
    case 'bill_info':
      return <td className={cellClass}>{waybill.noi_dung || waybill.mat_hang || '—'}</td>;
    case 'service_type':
      return <td className={cellClass}>{resolveServiceType(waybill)}</td>;
    case 'trip_label':
      return (
        <td className={cellClass}>
          <span
            className={clsx(
              'font-bold',
              !waybill.trip_label || waybill.trip_label.includes('Chưa phân') || waybill.trip_label.startsWith('Còn')
                ? 'text-amber-700'
                : 'text-foreground',
            )}
          >
            {waybill.trip_label || '—'}
          </span>
        </td>
      );
    case 'loaded_at':
      return (
        <td
          className={clsx(
            cellClass,
            getStorageAgeRowClass(waybill).includes('red')
              ? 'font-bold text-red-700'
              : getStorageAgeRowClass(waybill).includes('amber')
                ? 'font-bold text-amber-800'
                : 'text-muted-foreground',
          )}
        >
          {formatDate(resolveLoadedAt(waybill))}
        </td>
      );
    case 'received_at':
      return <td className={`${cellClass} text-muted-foreground`}>{formatDate(waybill.received_at || waybill.created_at)}</td>;
    case 'receiver_phone':
      return <td className={clsx(cellClass, 'font-bold text-primary')}>{resolveReceiverPhone(waybill)}</td>;
    case 'noi_den':
      return <td className={cellClass}>{resolveNoiDen(waybill)}</td>;
    case 'billing_unit':
      return <td className={cellClass}>{resolveBillingUnit(waybill)}</td>;
    case 'unit_price':
      return <td className={cellClass}>{displayValue(resolveUnitPrice(waybill), ' đ')}</td>;
    case 'transit_fee':
      return <td className={cellClass}>{displayValue(resolveTransitFee(waybill), ' đ')}</td>;
    case 'total_amount':
      return <td className={cellClass}>{displayValue(resolveFreight(waybill) + resolveTransitFee(waybill), ' đ')}</td>;
    case 'thu_ho_khach':
      return <td className={cellClass}>{displayValue(waybill.allocated_cod ?? waybill.cod_amount, ' đ')}</td>;
    case 'payment_method':
      return <td className={cellClass}>{resolvePaymentMethod(waybill)}</td>;
    case 'customer_payment_status':
      return <td className={cellClass}>{waybill.customer_payment_status === 'PAID' ? 'Đã TT' : waybill.customer_payment_status === 'SENT_STATEMENT' ? 'Đã gửi bảng kê' : '—'}</td>;
    case 'customer_payment_note':
      return <td className={cellClass}>{waybill.customer_payment_note || '—'}</td>;
    case 'route':
      return <td className={cellClass}>{resolveRoute(waybill)}</td>;
    case 'ma_kh':
      return <td className={cellClass}>{resolveMaKh(waybill)}</td>;
    case 'receiver_address':
      return <td className={cellClass}>{resolveReceiverAddress(waybill)}</td>;
    case 'package_count':
      return (
        <td className={`${cellClass} font-medium`}>
          {waybill.remaining_packages != null
            ? `${waybill.remaining_packages} / ${waybill.order_total_packages ?? waybill.package_count ?? waybill.remaining_packages}`
            : displayValue(waybill.package_count || waybill.declared_package_count)}
        </td>
      );
    case 'weight':
      return <td className={`${cellClass} font-medium`}>{displayValue(resolveWeightKg(waybill) || null, ' kg')}</td>;
    case 'volume':
      return <td className={`${cellClass} font-medium`}>{resolveVolumeM3(waybill) ? `${resolveVolumeM3(waybill).toFixed(2)} m³` : '—'}</td>;
    case 'freight':
      return (
        <td className={`${cellClass} font-bold`}>
          {canViewPricing ? displayValue(waybill.allocated_freight ?? resolveFreight(waybill), ' đ') : '—'}
        </td>
      );
    case 'sender_info':
      return <td className={`${cellClass} font-medium`}>{waybill.sender_info || '—'}</td>;
    case 'receiver_info':
      return <td className={`${cellClass} font-medium`}>{waybill.receiver_info || '—'}</td>;
    case 'current_hub':
      return (
        <td className={`${cellClass} text-muted-foreground`}>
          {formatHub(waybill.current_hub || waybill.origin_hub, waybill.current_hub_id || waybill.origin_hub_id)}
        </td>
      );
    case 'dest_hub':
      return <td className={`${cellClass} text-muted-foreground`}>{formatHub(waybill.dest_hub, waybill.dest_hub_id)}</td>;
    case 'payment_type':
      return <td className={cellClass}>{waybill.payment_type || '—'}</td>;
    case 'cod_amount':
      return <td className={`${cellClass} font-bold`}>{displayValue(waybill.allocated_cod ?? waybill.cod_amount, ' đ')}</td>;
    case 'priority':
      return <td className={cellClass}>{waybill.priority || '—'}</td>;
    default:
      return <td className={cellClass}>—</td>;
  }
}

interface Props {
  waybill: WaybillInventoryItem;
  columns: InventoryColumnDef[];
  canViewPricing: boolean;
  selected: boolean;
  onToggleSelect: (waybillId: string) => void;
}

export default function InventoryPickerRow({ waybill, columns, canViewPricing, selected, onToggleSelect }: Props) {
  const rowClass = getStorageAgeRowClass(waybill);

  return (
    <tr className={clsx('border-b border-border', rowClass)}>
      <td className="w-10 border-r border-border px-2 py-3 text-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(String(waybill.id))}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
          aria-label={`Chọn ${displayCode(waybill)}`}
        />
      </td>
      {columns.map((col) => (
        <Fragment key={col.id}>{renderCell(waybill, col.id, canViewPricing)}</Fragment>
      ))}
    </tr>
  );
}
