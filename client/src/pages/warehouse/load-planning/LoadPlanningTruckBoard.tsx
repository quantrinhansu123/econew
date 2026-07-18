import { clsx } from 'clsx';
import { Truck } from 'lucide-react';
import SplitLoadStatusControl from '../splits/SplitLoadStatusControl';
import type { LoadPlanningBoardItem, LoadPlanningTruckGroup } from './types';
import { resolveVietnamDistrict, resolveVietnamWard } from '../../../lib/vietnamAddressParts';

interface Props {
  truck: LoadPlanningTruckGroup;
  canViewCost?: boolean;
  onStatusUpdated?: () => void;
  showHeader?: boolean;
  /** Một nút trạng thái ở header dialog — ẩn cột trạng thái từng dòng. */
  bulkStatusMode?: boolean;
  /** Danh sách xe đến HCM ưu tiên gom đơn cùng quận/huyện để phân tuyến. */
  sortByDistrict?: boolean;
}

const formatNumber = (value?: number | string | null, suffix = '') =>
  value == null || value === '' ? '—' : `${Number(value).toLocaleString('vi-VN')}${suffix}`;

const isCarrierRowNote = (note: string, item: LoadPlanningBoardItem) => {
  const normalized = note.trim().toLowerCase();
  if (/^xe\s/.test(normalized)) return true;
  const carrier = String(item.xe_phat ?? '').trim().toLowerCase();
  return Boolean(carrier && (normalized === carrier || normalized === `xe ${carrier}`));
};

export default function LoadPlanningTruckBoard({
  truck,
  canViewCost,
  onStatusUpdated,
  showHeader = true,
  bulkStatusMode = false,
  sortByDistrict = false,
}: Props) {
  const truckLabel = [truck.license_plate, truck.nha_xe ? `xe ${truck.nha_xe}` : null].filter(Boolean).join(' · ');
  const items = sortByDistrict
    ? [...(truck.items ?? [])].sort((left, right) => {
        const leftDistrict = resolveVietnamDistrict(left.quan_huyen, left.dia_chi);
        const rightDistrict = resolveVietnamDistrict(right.quan_huyen, right.dia_chi);
        if (!leftDistrict && rightDistrict) return 1;
        if (leftDistrict && !rightDistrict) return -1;
        const districtCompare = leftDistrict.localeCompare(rightDistrict, 'vi', { numeric: true });
        if (districtCompare !== 0) return districtCompare;
        const wardCompare = resolveVietnamWard(left.phuong_xa, left.dia_chi)
          .localeCompare(resolveVietnamWard(right.phuong_xa, right.dia_chi), 'vi', { numeric: true });
        if (wardCompare !== 0) return wardCompare;
        return Number(left.loading_position ?? 9999) - Number(right.loading_position ?? 9999);
      })
    : (truck.items ?? []);

  return (
    <section className="overflow-hidden rounded-xl border border-border shadow-sm">
      {showHeader && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-slate-100 px-4 py-2.5">
          <Truck size={16} className="shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-extrabold text-foreground">{truckLabel || `Xe #${truck.truck_id}`}</p>
            <p className="text-[11px] text-muted-foreground">
              {[truck.ten_lai_xe, truck.trip_id ? `Chuyến #${truck.trip_id}` : 'Chưa gán chuyến'].filter(Boolean).join(' · ')}
              {truck.manifest_code ? ` · BK ${truck.manifest_code}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">{formatNumber(truck.total_packages)} kiện</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{formatNumber(truck.total_weight, ' kg')}</span>
            {canViewCost && truck.total_freight != null && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">{formatNumber(truck.total_freight, ' đ')}</span>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto overflow-y-visible">
        <table className="w-full min-w-[1120px] table-fixed border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-border bg-white text-[11px] font-bold uppercase tracking-wide text-slate-700">
              <th className="w-[4%] border-r border-border bg-yellow-300 px-2 py-2 text-center">Vị trí</th>
              {!bulkStatusMode && (
                <th className="w-[9%] border-r border-border px-2 py-2 text-center">Trạng thái</th>
              )}
              <th className="w-[5%] border-r border-border px-2 py-2 text-center">Ngày bốc</th>
              <th className="w-[5%] border-r border-border px-2 py-2 text-center">Ngày tới</th>
              <th className="w-[5%] border-r border-border px-2 py-2 text-center">Mã Tỉnh</th>
              <th className="w-[8%] border-r border-border px-2 py-2">Quận/Huyện</th>
              <th className="w-[8%] border-r border-border px-2 py-2">Phường/Xã</th>
              <th className="w-[10%] border-r border-border px-2 py-2">Tên CTY</th>
              <th className="w-[3%] border-r border-border px-2 py-2 text-center">DV</th>
              <th className="w-[14%] border-r border-border px-2 py-2">Mặt Hàng</th>
              <th className="w-[12%] border-r border-border px-2 py-2">Nơi Trả</th>
              <th className="w-[5%] border-r border-border px-2 py-2 text-center">Số Lượng</th>
              <th className="w-[4%] border-r border-border px-2 py-2 text-center">Loại</th>
              {canViewCost && (
                <th className="w-[8%] border-r border-border px-2 py-2 text-right">Cước phí</th>
              )}
              <th className={clsx('px-2 py-2', canViewCost ? (bulkStatusMode ? 'w-[30%]' : 'w-[21%]') : (bulkStatusMode ? 'w-[38%]' : 'w-[29%]'))}>Địa chỉ</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <DispatchRow
                key={String(item.split_id ?? item.waybill_id)}
                item={item}
                canViewCost={canViewCost}
                onStatusUpdated={onStatusUpdated}
                bulkStatusMode={bulkStatusMode}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DispatchRow({
  item,
  canViewCost,
  onStatusUpdated,
  bulkStatusMode,
}: {
  item: LoadPlanningBoardItem;
  canViewCost?: boolean;
  onStatusUpdated?: () => void;
  bulkStatusMode?: boolean;
}) {
  const noteInRed = item.mat_hang_note && item.mat_hang !== item.mat_hang_note;

  return (
    <tr className="border-b border-border align-top hover:bg-muted/5">
      <td className="border-r border-border bg-yellow-200 px-2 py-2 text-center text-[14px] font-extrabold text-foreground">
        {item.vi_tri_hang ?? item.loading_position ?? '—'}
      </td>
      {!bulkStatusMode && (
        <td className="overflow-visible border-r border-border px-2 py-2 text-center">
          <SplitLoadStatusControl
            splitId={item.split_id}
            value={item.load_status ?? 'WAITING_LOAD'}
            compact
            onUpdated={() => onStatusUpdated?.()}
          />
        </td>
      )}
      <td className="border-r border-border px-2 py-2 text-center font-medium">{item.ngay_boc || '—'}</td>
      <td className="border-r border-border px-2 py-2 text-center font-bold text-emerald-800">{item.ngay_toi || '—'}</td>
      <td className="border-r border-border px-2 py-2 text-center font-bold">{item.ma_tinh || item.noi_den || '—'}</td>
      <td className="border-r border-border px-2 py-2 font-bold break-words">
        {resolveVietnamDistrict(item.quan_huyen, item.dia_chi) || '—'}
      </td>
      <td className="border-r border-border px-2 py-2 break-words">
        {resolveVietnamWard(item.phuong_xa, item.dia_chi) || '—'}
      </td>
      <td className="border-r border-border px-2 py-2 text-center font-bold break-words">{item.ten_cty || '—'}</td>
      <td className="border-r border-border px-2 py-2 text-center font-bold">{item.dv || 'TC'}</td>
      <td className="border-r border-border px-2 py-2 break-words">
        <div className="font-medium leading-snug">{item.mat_hang || item.waybill_code || '—'}</div>
        {noteInRed && !isCarrierRowNote(String(item.mat_hang_note), item) && (
          <div className="mt-0.5 text-[11px] font-bold leading-snug text-red-600">{item.mat_hang_note}</div>
        )}
      </td>
      <td className="border-r border-border px-2 py-2 text-[11px] font-medium leading-snug break-words">{item.noi_tra || '—'}</td>
      <td className={clsx('border-r border-border px-2 py-2 text-center font-extrabold')}>{item.so_luong ?? '—'}</td>
      <td className="border-r border-border px-2 py-2 text-center">{item.loai || 'kiện'}</td>
      {canViewCost && (
        <td className="border-r border-border px-2 py-2 text-right text-[11px] font-extrabold text-amber-800">
          {formatNumber(item.allocated_freight, ' đ')}
        </td>
      )}
      <td className="px-2 py-2 text-[11px] leading-snug break-words">{item.dia_chi || '—'}</td>
    </tr>
  );
}
