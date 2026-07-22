import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { clsx } from 'clsx';

import WaybillImagePicker from '../../../../components/WaybillImagePicker';
import type { LastMileWaybill } from '../types';
import {
  buildDeliveryStatusPayload,
  getAllowedDeliveryStatuses,
  getUsableDeliveryPhotos,
  type DeliveryStatus,
} from '../deliveryStatusUtils';

interface Props {
  waybill: LastMileWaybill | null;
  isSubmitting: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (status: DeliveryStatus, deliveryPhotoUrl?: string) => void;
}

export default function UpdateDeliveryStatusDialog(props: Props) {
  if (!props.waybill) return null;

  return (
    <DeliveryStatusDialogContent
      key={`${props.waybill.id}:${props.waybill.delivery_photo_url || ''}`}
      {...props}
      waybill={props.waybill}
    />
  );
}

function DeliveryStatusDialogContent({ waybill, isSubmitting, error, onClose, onConfirm }: Omit<Props, 'waybill'> & { waybill: LastMileWaybill }) {
  const [deliveryPhotos, setDeliveryPhotos] = useState<string[]>(
    () => getUsableDeliveryPhotos(waybill.delivery_photo_url),
  );
  const [isPhotoUploading, setIsPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const currentStatus = String(waybill.current_state || '').toUpperCase();
  const nextStatuses = getAllowedDeliveryStatuses(currentStatus);
  const needsDeliveryProof = currentStatus === 'OUT_FOR_DELIVERY';
  const isBusy = isSubmitting || isPhotoUploading;
  const labels: Record<DeliveryStatus, string> = {
    OUT_FOR_DELIVERY: 'Bàn giao tài xế chặng cuối',
    DELIVERED: 'Xác nhận giao thành công',
    RETURNED: 'Xác nhận hoàn hàng',
  };

  const confirmStatus = (status: DeliveryStatus) => {
    try {
      const payload = buildDeliveryStatusPayload(status, deliveryPhotos);
      setPhotoError('');
      onConfirm(status, payload.delivery_photo_url);
    } catch (validationError) {
      setPhotoError(validationError instanceof Error
        ? validationError.message
        : 'Vui lòng kiểm tra ảnh giao hàng.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border bg-white shadow-xl sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-primary">Cập nhật trạng thái</p>
            <h2 className="text-base font-black text-foreground">{waybill.waybill_code}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-[13px] text-muted-foreground">
          <p>Chọn trạng thái hợp lệ tiếp theo cho vận đơn này.</p>

          {needsDeliveryProof && (
            <WaybillImagePicker
              value={deliveryPhotos}
              onChange={(urls) => {
                setDeliveryPhotos(urls);
                setPhotoError('');
              }}
              onUploadingChange={setIsPhotoUploading}
              disabled={isBusy}
              title="Ảnh giao hàng"
              description="Bắt buộc ít nhất 1 ảnh để xác nhận giao thành công. Có thể chụp bằng camera sau hoặc chọn tối đa 4 ảnh từ thư viện."
              emptyMessage="Chưa có ảnh giao hàng."
            />
          )}

          {needsDeliveryProof && deliveryPhotos.length === 0 && !photoError && (
            <p className="text-[11px] font-bold text-amber-700">Upload ít nhất 1 ảnh trước khi chọn “Giao thành công”.</p>
          )}

          <div className="grid gap-2">
            {nextStatuses.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => confirmStatus(status)}
                disabled={isBusy || (status === 'DELIVERED' && deliveryPhotos.length === 0)}
                className={clsx(
                  'flex min-h-10 items-center justify-between rounded-xl border px-3 py-2 text-left text-[13px] font-black transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  status === 'DELIVERED'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : status === 'RETURNED'
                      ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                      : 'border-primary/30 bg-blue-50 text-primary hover:bg-blue-100',
                )}
              >
                <span>{labels[status]}</span>
                <span className="ml-3 text-[10px] opacity-70">{status}</span>
              </button>
            ))}
          </div>

          {nextStatuses.length === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 font-bold text-amber-800">
              Trạng thái hiện tại không có bước chuyển giao hàng hợp lệ.
            </div>
          )}
          {(photoError || error) && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 font-bold text-red-700" role="alert">
              {photoError || error}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border p-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="h-9 rounded-lg border border-border px-3 text-[13px] font-bold text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Hủy
          </button>
          {isBusy && (
            <span className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-[13px] font-black text-white">
              <Loader2 size={15} className="animate-spin" />
              {isPhotoUploading ? 'Đang upload ảnh' : 'Đang cập nhật'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
