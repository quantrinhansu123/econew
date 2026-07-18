import { useMemo, useState } from 'react';
import { Camera, Check, Loader2, Package, X } from 'lucide-react';
import { clsx } from 'clsx';
import { ApiError, apiRequest } from '../../../../lib/api';
import { ImagePreviewModal } from '../../../../components/ImagePreviewModal';
import { uploadWaybillImage } from '../../../../lib/uploadImage';
import type { LoadPlanningManifest, ManifestWaybill } from '../types';
import {
  HUB_DELIVERY_STATUS_OPTIONS,
  hubDeliveryLabelFromWaybill,
  joinDeliveryPhotos,
  parseDeliveryPhotos,
  type HubDeliveryStatusValue,
} from '../manifestHubUtils';

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  isLoading: boolean;
  manifest: LoadPlanningManifest | null;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

type RowState = {
  status: HubDeliveryStatusValue;
  photos: string[];
};

const extractWaybills = (manifest: LoadPlanningManifest | null): ManifestWaybill[] => {
  if (!manifest) return [];
  if (manifest.waybills?.length) return manifest.waybills;
  return (manifest.manifest_waybills || [])
    .map((link) =>
      link.waybill
        ? {
            ...link.waybill,
            loading_position: link.loading_position ?? link.waybill.loading_position,
            dispatch_fields: { ...(link.waybill.dispatch_fields ?? {}), ...(link.dispatch_fields ?? {}) },
          }
        : null,
    )
    .filter(Boolean) as ManifestWaybill[];
};

const initialRowState = (waybill: ManifestWaybill): RowState => {
  const label = hubDeliveryLabelFromWaybill(waybill);
  const matched = HUB_DELIVERY_STATUS_OPTIONS.find((item) => item.value === label);
  return {
    status: matched?.value ?? 'Lưu kho - chờ xử lý',
    photos: parseDeliveryPhotos(waybill.delivery_photo_url),
  };
};

export default function ArrivedTruckWaybillDialog({
  isOpen,
  isClosing,
  isLoading,
  manifest,
  canManage,
  onClose,
  onSaved,
}: Props) {
  const waybills = useMemo(() => extractWaybills(manifest), [manifest]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const getRow = (waybill: ManifestWaybill): RowState => {
    const key = String(waybill.id);
    return rows[key] ?? initialRowState(waybill);
  };

  const patchRow = (waybillId: string | number, patch: Partial<RowState>) => {
    const key = String(waybillId);
    setRows((prev) => {
      const waybill = waybills.find((item) => String(item.id) === key);
      const base = prev[key] ?? (waybill ? initialRowState(waybill) : { status: 'Lưu kho - chờ xử lý' as HubDeliveryStatusValue, photos: [] });
      return { ...prev, [key]: { ...base, ...patch } };
    });
  };

  const readPhoto = async (waybillId: string | number, file: File | null) => {
    if (!file) return;
    const key = String(waybillId);
    const row = getRow(waybills.find((item) => String(item.id) === key)!);
    if (row.photos.length >= 4) {
      setError('Tối đa 4 ảnh cho mỗi vận đơn.');
      return;
    }
    setUploadingId(key);
    setError('');
    try {
      const url = await uploadWaybillImage(file);
      patchRow(key, { photos: [...row.photos, url].slice(0, 4) });
    } catch (uploadError) {
      setError(uploadError instanceof ApiError ? uploadError.message : 'Không upload được ảnh bill.');
    } finally {
      setUploadingId(null);
    }
  };

  const saveWaybill = async (waybill: ManifestWaybill) => {
    if (!manifest || !canManage) return;
    const row = getRow(waybill);
    const option = HUB_DELIVERY_STATUS_OPTIONS.find((item) => item.value === row.status);
    if (!option) return;
    if (option.requiresPhoto && row.photos.length === 0) {
      setError(`Vận đơn ${waybill.waybill_code || waybill.id}: cần chụp ít nhất 1 ảnh khi giao thành công.`);
      return;
    }

    setSavingId(String(waybill.id));
    setError('');
    try {
      await apiRequest(`/manifests/${manifest.id}/dispatch-rows`, {
        method: 'PATCH',
        body: {
          rows: [
            {
              waybill_id: waybill.id,
              fields: {
                ...(waybill.dispatch_fields ?? {}),
                trang_thai_giao: row.status,
                du_kien_toi_hcm: waybill.dispatch_fields?.du_kien_toi_hcm ?? '',
              },
            },
          ],
        },
      });

      await apiRequest(`/waybills/${waybill.id}/photos`, {
        method: 'PATCH',
        body: {
          delivery_photo_url: joinDeliveryPhotos(row.photos),
        },
      });

      const currentState = String(waybill.current_state || 'AT_DEST_HUB');
      const targetState = option.waybillStatus;
      if (currentState !== targetState) {
        await apiRequest(`/waybills/${waybill.id}/status`, {
          method: 'PATCH',
          body: {
            status: targetState,
          },
        });
      }

      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể cập nhật trạng thái vận đơn.');
    } finally {
      setSavingId(null);
    }
  };

  if (!isOpen) return null;

  const code = manifest?.manifest_code || manifest?.code || (manifest ? `MF-${manifest.id}` : '—');

  return (
    <div className="fixed inset-0 z-[10000] flex justify-end">
      <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={onClose} />
      <div
        className={clsx(
          'relative flex h-screen w-full max-w-[min(1400px,98vw)] flex-col border-l border-border bg-[#f8fafc] shadow-2xl',
          isClosing ? 'dialog-slide-out' : 'dialog-slide-in',
        )}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-white px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">Xe đã đến · cập nhật đơn</p>
            <h2 className="mt-1 truncate text-xl font-black text-foreground">{code}</h2>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white text-muted-foreground hover:bg-muted">
            <X size={18} />
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-auto p-4 custom-scrollbar">
          {error && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-800">
              {error}
            </div>
          )}
          {isLoading ? (
            <State label="Đang tải danh sách đơn..." />
          ) : !manifest ? (
            <State label="Không tìm thấy bảng kê." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-white px-4 py-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Package size={16} />
                </span>
                <div>
                  <p className="text-[12px] font-black uppercase tracking-wide text-emerald-800">Danh sách đơn trên xe</p>
                  <p className="text-[12px] font-semibold text-slate-600">{waybills.length} vận đơn · cập nhật trạng thái giao</p>
                </div>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full min-w-[1080px] text-left text-[12px]">
                  <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Mã bill</th>
                      <th className="px-3 py-2">Dự kiến đến</th>
                      <th className="px-3 py-2">Trạng thái giao</th>
                      <th className="px-3 py-2">Ảnh bill / báo phát (≤4)</th>
                      <th className="px-3 py-2 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waybills.map((waybill, index) => {
                      const row = getRow(waybill);
                      const isSaving = savingId === String(waybill.id);
                      const isUploading = uploadingId === String(waybill.id);
                      return (
                        <tr key={waybill.id} className="border-t border-slate-100 align-top odd:bg-white even:bg-slate-50/70">
                          <td className="px-3 py-3 font-black text-amber-800">{waybill.loading_position ?? index + 1}</td>
                          <td className="px-3 py-3 font-black text-primary">{waybill.waybill_code || waybill.id}</td>
                          <td className="px-3 py-3 font-semibold text-slate-700">
                            {String(waybill.dispatch_fields?.du_kien_toi_hcm || '—')}
                          </td>
                          <td className="px-3 py-3">
                            <select
                              disabled={!canManage || isSaving || isUploading}
                              value={row.status}
                              onChange={(event) => patchRow(waybill.id, { status: event.target.value as HubDeliveryStatusValue })}
                              className="h-9 w-full min-w-[170px] rounded-lg border border-border bg-white px-2 text-[12px] font-bold outline-none focus:ring-2 focus:ring-primary/20"
                            >
                              {HUB_DELIVERY_STATUS_OPTIONS.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.value}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {row.photos.map((photo, photoIndex) => (
                                <span key={photo} className="group relative h-10 w-10">
                                  <button type="button" onClick={() => setPreviewUrl(photo)} className="h-10 w-10">
                                    <img src={photo} alt={`Ảnh bill ${photoIndex + 1}`} className="h-10 w-10 rounded-lg border border-slate-200 object-cover" />
                                  </button>
                                  {canManage && !isUploading && (
                                    <button
                                      type="button"
                                      aria-label={`Xóa ảnh ${photoIndex + 1}`}
                                      onClick={() => patchRow(waybill.id, { photos: row.photos.filter((item) => item !== photo) })}
                                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-white"
                                    >
                                      <X size={10} />
                                    </button>
                                  )}
                                </span>
                              ))}
                              {canManage && row.photos.length < 4 && (
                                <label className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100">
                                  {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="hidden"
                                    disabled={isSaving || isUploading}
                                    onChange={(event) => {
                                      void readPhoto(waybill.id, event.target.files?.[0] ?? null);
                                      event.target.value = '';
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              disabled={!canManage || isSaving || isUploading}
                              onClick={() => void saveWaybill(waybill)}
                              className="inline-flex h-9 items-center gap-1 rounded-lg bg-primary px-3 text-[11px] font-black text-white disabled:opacity-50"
                            >
                              {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                              Lưu
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!waybills.length && <State label="Chưa có vận đơn trên xe." />}
              </div>
            </div>
          )}
        </main>
        <ImagePreviewModal
          imageUrl={previewUrl}
          title="Ảnh bill / báo phát"
          onClose={() => setPreviewUrl(null)}
        />
      </div>
    </div>
  );
}

function State({ label }: { label: string }) {
  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-border bg-white text-[13px] font-bold text-muted-foreground">
      {label}
    </div>
  );
}
