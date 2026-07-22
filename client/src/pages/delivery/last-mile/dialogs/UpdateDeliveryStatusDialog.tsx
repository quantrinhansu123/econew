import { useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, Loader2, RotateCcw, Trash2, Truck, X } from 'lucide-react';
import { ApiError } from '../../../../lib/api';
import { uploadWaybillImage } from '../../../../lib/uploadImage';
import type {
  DeliveryReturnAction,
  DeliveryStatusPayload,
  LastMileWaybill,
} from '../types';

type DeliveryStatus = DeliveryStatusPayload['status'];

interface Props {
  waybill: LastMileWaybill | null;
  isSubmitting: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (payload: DeliveryStatusPayload) => void;
}

const returnOptions: Array<{ value: DeliveryReturnAction; label: string }> = [
  { value: 'STORE_AT_HUB', label: 'Lưu kho tại bưu cục' },
  { value: 'WAIT_REDELIVERY', label: 'Chờ phát lại' },
  { value: 'REDIRECT_ADDRESS', label: 'Giao lại địa chỉ khác' },
];

export default function UpdateDeliveryStatusDialog({ waybill, isSubmitting, error, onClose, onConfirm }: Props) {
  const [selectedStatus, setSelectedStatus] = useState<DeliveryStatus>('OUT_FOR_DELIVERY');
  const [deliveryVehicle, setDeliveryVehicle] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [returnReason, setReturnReason] = useState('');
  const [returnAction, setReturnAction] = useState<DeliveryReturnAction>('WAIT_REDELIVERY');
  const [redeliveryAddress, setRedeliveryAddress] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const currentStatus = String(waybill?.current_state || '').toUpperCase();
  const nextStatuses = useMemo<DeliveryStatus[]>(() => (
    currentStatus === 'OUT_FOR_DELIVERY' ? ['DELIVERED', 'RETURNED'] : ['OUT_FOR_DELIVERY']
  ), [currentStatus]);

  useEffect(() => {
    if (!waybill) return;
    setSelectedStatus(String(waybill.current_state || '').toUpperCase() === 'OUT_FOR_DELIVERY' ? 'DELIVERED' : 'OUT_FOR_DELIVERY');
    setDeliveryVehicle(waybill.xe_phat?.trim() || '');
    setPhotos([]);
    setReturnReason('');
    setReturnAction('WAIT_REDELIVERY');
    setRedeliveryAddress(waybill.redelivery_address?.trim() || '');
    setUploadError('');
  }, [waybill]);

  if (!waybill) return null;

  const isRedirect = returnAction === 'REDIRECT_ADDRESS';
  const canSubmit = !isSubmitting && !isUploading && (
    selectedStatus === 'OUT_FOR_DELIVERY'
    || (selectedStatus === 'DELIVERED' && photos.length > 0)
    || (selectedStatus === 'RETURNED' && Boolean(returnReason.trim()) && Boolean(returnAction) && (!isRedirect || Boolean(redeliveryAddress.trim())))
  );

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const remaining = 4 - photos.length;
    if (remaining <= 0) return;
    setIsUploading(true);
    setUploadError('');
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files).slice(0, remaining)) {
        uploaded.push(await uploadWaybillImage(file));
      }
      setPhotos((current) => [...current, ...uploaded].slice(0, 4));
    } catch (uploadFailure) {
      setUploadError(uploadFailure instanceof ApiError ? uploadFailure.message : 'Không tải được ảnh giao hàng.');
    } finally {
      setIsUploading(false);
    }
  }

  function submit() {
    if (!canSubmit) return;
    const payload: DeliveryStatusPayload = { status: selectedStatus };
    if (selectedStatus === 'OUT_FOR_DELIVERY') {
      payload.delivery_vehicle = deliveryVehicle.trim() || undefined;
    }
    if (selectedStatus === 'DELIVERED') {
      payload.delivery_photo_url = photos.join('|');
    }
    if (selectedStatus === 'RETURNED') {
      payload.return_reason = returnReason.trim();
      payload.return_action = returnAction;
      payload.redelivery_address = isRedirect ? redeliveryAddress.trim() : undefined;
    }
    onConfirm(payload);
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-primary">Cập nhật giao chặng cuối</p>
            <h2 className="text-lg font-black text-foreground">{waybill.waybill_code}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={isSubmitting || isUploading} className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[calc(92vh-132px)] space-y-4 overflow-y-auto p-5 custom-scrollbar">
          {currentStatus === 'RETURNED' && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-800">
              <p className="font-black">Lần phát trước chưa thành công</p>
              <p className="mt-1">{waybill.return_reason || 'Chưa có lý do'}{waybill.redelivery_address ? ` · Địa chỉ mới: ${waybill.redelivery_address}` : ''}</p>
            </div>
          )}

          {nextStatuses.length > 1 && (
            <div className="grid grid-cols-2 gap-2">
              <StatusButton active={selectedStatus === 'DELIVERED'} tone="green" icon={<CheckCircle2 size={17} />} label="Giao thành công" onClick={() => setSelectedStatus('DELIVERED')} />
              <StatusButton active={selectedStatus === 'RETURNED'} tone="red" icon={<RotateCcw size={17} />} label="Hoàn hàng" onClick={() => setSelectedStatus('RETURNED')} />
            </div>
          )}

          {selectedStatus === 'OUT_FOR_DELIVERY' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-[13px] text-blue-800">
                <p className="flex items-center gap-2 font-black"><Truck size={16} />{currentStatus === 'RETURNED' ? 'Xác nhận phát lại' : 'Xác nhận nhận đi giao'}</p>
                <p className="mt-1 text-[12px]">Lần phát tiếp theo: #{Number(waybill.delivery_attempt_count || 0) + 1}</p>
              </div>
              <Field label="Xe giao / BKS (không bắt buộc)">
                <input value={deliveryVehicle} onChange={(event) => setDeliveryVehicle(event.target.value)} placeholder="VD: 51H-12345" className="h-10 w-full rounded-lg border border-border px-3 text-[13px] outline-none focus:border-primary" />
              </Field>
              <Field label="Địa chỉ giao">
                <div className="rounded-lg border border-border bg-slate-50 px-3 py-2.5 text-[13px] font-semibold text-foreground">
                  {waybill.redelivery_address || waybill.receiver_address || waybill.receiver_info}
                </div>
              </Field>
            </div>
          )}

          {selectedStatus === 'DELIVERED' && (
            <Field label="Ảnh xác nhận giao thành công (bắt buộc, tối đa 4)">
              <div className="mt-1 flex flex-wrap gap-2">
                {photos.map((photo, index) => (
                  <span key={photo} className="group relative h-20 w-20">
                    <img src={photo} alt={`Xác nhận giao ${index + 1}`} className="h-20 w-20 rounded-xl border border-emerald-200 object-cover" />
                    <button type="button" onClick={() => setPhotos((current) => current.filter((item) => item !== photo))} className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow">
                      <Trash2 size={12} />
                    </button>
                  </span>
                ))}
                {photos.length < 4 && (
                  <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                    {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
                    <span className="mt-1 text-[10px] font-black">Thêm ảnh</span>
                    <input type="file" accept="image/*" capture="environment" multiple disabled={isUploading || isSubmitting} className="hidden" onChange={(event) => { void addPhotos(event.target.files); event.target.value = ''; }} />
                  </label>
                )}
              </div>
            </Field>
          )}

          {selectedStatus === 'RETURNED' && (
            <div className="space-y-3">
              <Field label="Lý do giao không thành công *">
                <textarea rows={3} value={returnReason} onChange={(event) => setReturnReason(event.target.value)} placeholder="VD: Không liên hệ được người nhận, khách hẹn ngày khác..." className="w-full rounded-lg border border-border px-3 py-2 text-[13px] outline-none focus:border-primary" />
              </Field>
              <Field label="Hướng xử lý *">
                <select value={returnAction} onChange={(event) => setReturnAction(event.target.value as DeliveryReturnAction)} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-bold outline-none focus:border-primary">
                  {returnOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
              {isRedirect && (
                <Field label="Địa chỉ giao lại *">
                  <textarea rows={2} value={redeliveryAddress} onChange={(event) => setRedeliveryAddress(event.target.value)} placeholder="Nhập đầy đủ địa chỉ giao mới" className="w-full rounded-lg border border-border px-3 py-2 text-[13px] outline-none focus:border-primary" />
                </Field>
              )}
            </div>
          )}

          {(error || uploadError) && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] font-bold text-red-700">{error || uploadError}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button type="button" onClick={onClose} disabled={isSubmitting || isUploading} className="h-10 rounded-lg border border-border px-4 text-[13px] font-bold text-muted-foreground hover:bg-muted disabled:opacity-50">Hủy</button>
          <button type="button" onClick={submit} disabled={!canSubmit} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-black text-white disabled:opacity-40">
            {(isSubmitting || isUploading) && <Loader2 size={15} className="animate-spin" />}
            {selectedStatus === 'DELIVERED' ? 'Xác nhận đã giao' : selectedStatus === 'RETURNED' ? 'Xác nhận hoàn hàng' : currentStatus === 'RETURNED' ? 'Phát lại' : 'Nhận đi giao'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-muted-foreground">{label}</span>{children}</label>;
}

function StatusButton({ active, tone, icon, label, onClick }: { active: boolean; tone: 'green' | 'red'; icon: React.ReactNode; label: string; onClick: () => void }) {
  const activeClass = tone === 'green' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-red-500 bg-red-50 text-red-700';
  return <button type="button" onClick={onClick} className={`flex h-12 items-center justify-center gap-2 rounded-xl border text-[13px] font-black ${active ? activeClass : 'border-border bg-white text-muted-foreground hover:bg-muted'}`}>{icon}{label}</button>;
}
