import { Banknote, Edit, Eye, Trash2 } from 'lucide-react';
import { RowActionsMenu, RowActionsMenuItem } from '../../../components/ui/RowActionsMenu';
import type { IncomingTrip } from './types';
import { getManifestId } from './incomingTripUtils';

export function IncomingTripRowActions({
  trip,
  canDelete,
  canPay,
  onView,
  onEdit,
  onDelete,
  onPayment,
}: {
  trip: IncomingTrip;
  canDelete: boolean;
  canPay: boolean;
  onView: (trip: IncomingTrip) => void;
  onEdit: (trip: IncomingTrip) => void;
  onDelete: (trip: IncomingTrip) => void;
  onPayment: (trip: IncomingTrip) => void;
}) {
  const hasManifest = Boolean(getManifestId(trip));

  return (
    <div className="flex justify-center">
      <RowActionsMenu label="Thao tác chuyến xe">
        <RowActionsMenuItem
          icon={<Eye size={14} />}
          label="Xem"
          tone="primary"
          onClick={() => onView(trip)}
        />
        <RowActionsMenuItem
          icon={<Edit size={14} />}
          label="Sửa"
          tone="amber"
          disabled={!hasManifest}
          title={hasManifest ? 'Sửa bảng kê' : 'Chưa có bảng kê'}
          onClick={() => onEdit(trip)}
        />
        <RowActionsMenuItem
          icon={<Trash2 size={14} />}
          label="Xóa"
          tone="danger"
          disabled={!canDelete || !hasManifest}
          title={canDelete ? 'Xóa bảng kê nháp' : 'Cần quyền quản lý'}
          onClick={() => onDelete(trip)}
        />
        <RowActionsMenuItem
          icon={<Banknote size={14} />}
          label="Thanh toán"
          tone="emerald"
          disabled={!canPay}
          title={canPay ? 'Cập nhật thanh toán NCC' : 'Cần quyền kế toán'}
          onClick={() => onPayment(trip)}
        />
      </RowActionsMenu>
    </div>
  );
}
