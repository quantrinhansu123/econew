import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  FileQuestion,
  ImagePlus,
  Loader2,
  RefreshCw,
  ScanBarcode,
  Trash2,
} from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';
import { IMAGE_UPLOAD_ACCEPT, uploadWaybillImage } from '../lib/uploadImage';
import ProofCameraDialog from './delivery/proof/ProofCameraDialog';
import { isExactWaybillNotFoundError, proofResultLabel } from './delivery/proof/deliveryProofUtils';
import { decodeWaybillCodeFromProofImage } from './delivery/proof/proofImageDecoder';

type ProofStatus = 'PROCESSING' | 'SUCCESS' | 'UNREADABLE' | 'NOT_FOUND' | 'ALREADY_DELIVERED' | 'ERROR';

type ProofItem = {
  id: string;
  file: File;
  previewUrl: string;
  status: ProofStatus;
  detectedCode: string | null;
  matchedCode: string | null;
  message: string;
};

type ResolveResponse = {
  outcome: 'READY' | 'ALREADY_DELIVERED';
  waybill: { id: string; waybill_code: string; current_state: string };
};

type ConfirmResponse = {
  outcome: 'SUCCESS' | 'ALREADY_DELIVERED';
  waybill: { id: string; waybill_code: string; current_state?: string; status?: string };
};

const createItemId = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const statusStyle: Record<ProofStatus, string> = {
  PROCESSING: 'border-sky-200 bg-sky-50 text-sky-700',
  SUCCESS: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  UNREADABLE: 'border-amber-200 bg-amber-50 text-amber-800',
  NOT_FOUND: 'border-rose-200 bg-rose-50 text-rose-700',
  ALREADY_DELIVERED: 'border-violet-200 bg-violet-50 text-violet-700',
  ERROR: 'border-red-200 bg-red-50 text-red-700',
};

export default function DeliveryProofPage() {
  const [items, setItems] = useState<ProofItem[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const itemsRef = useRef<ProofItem[]>([]);
  const processingQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => () => {
    itemsRef.current.forEach(item => URL.revokeObjectURL(item.previewUrl));
  }, []);

  const summary = useMemo(() => ({
    total: items.length,
    success: items.filter(item => item.status === 'SUCCESS').length,
    unreadable: items.filter(item => item.status === 'UNREADABLE').length,
    notFound: items.filter(item => item.status === 'NOT_FOUND').length,
    already: items.filter(item => item.status === 'ALREADY_DELIVERED').length,
  }), [items]);

  const patchItem = (id: string, patch: Partial<ProofItem>) => {
    setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const processItem = async (id: string, file: File, previewUrl: string) => {
    patchItem(id, {
      status: 'PROCESSING',
      detectedCode: null,
      matchedCode: null,
      message: 'Đang đọc barcode/mã vận đơn trên ảnh...',
    });

    let detectedCode: string | null = null;
    try {
      detectedCode = await decodeWaybillCodeFromProofImage(previewUrl);
      if (!detectedCode) throw new Error('UNSUPPORTED_BARCODE');
    } catch {
      patchItem(id, {
        status: 'UNREADABLE',
        message: 'Không đọc được mã vận đơn. Hãy chụp rõ, đủ sáng và giữ trọn barcode trong ảnh.',
      });
      return;
    }

    patchItem(id, { detectedCode, message: `Đã đọc ${detectedCode}. Đang kiểm tra đúng vận đơn...` });
    let resolved: ResolveResponse;
    try {
      resolved = await apiRequest<ResolveResponse>(`/waybills/proof-of-delivery/resolve?code=${encodeURIComponent(detectedCode)}`);
    } catch (error) {
      if (error instanceof ApiError && isExactWaybillNotFoundError(error)) {
        patchItem(id, { status: 'NOT_FOUND', message: `Không tồn tại vận đơn mang mã ${detectedCode}. Ảnh chưa được tải lên hoặc gắn vào đơn nào.` });
        return;
      }
      const backendMessage = error instanceof ApiError && error.status === 404
        ? 'Backend Báo phát chưa được cập nhật. Hãy deploy lại Render rồi thử lại; ảnh chưa được tải lên hoặc gắn vào đơn nào.'
        : error instanceof Error ? error.message : 'Không kiểm tra được mã vận đơn.';
      patchItem(id, { status: 'ERROR', message: backendMessage });
      return;
    }

    if (resolved.outcome === 'ALREADY_DELIVERED') {
      patchItem(id, {
        status: 'ALREADY_DELIVERED',
        matchedCode: resolved.waybill.waybill_code,
        message: `Vận đơn ${resolved.waybill.waybill_code} đã báo phát. Ảnh mới không được gắn lại.`,
      });
      return;
    }

    patchItem(id, {
      matchedCode: resolved.waybill.waybill_code,
      message: `Đã khớp chính xác ${resolved.waybill.waybill_code}. Đang lưu ảnh bằng chứng...`,
    });
    try {
      const photoUrl = await uploadWaybillImage(file);
      const confirmed = await apiRequest<ConfirmResponse>('/waybills/proof-of-delivery', {
        method: 'POST',
        body: { waybill_code: resolved.waybill.waybill_code, photo_url: photoUrl },
      });
      if (confirmed.outcome === 'ALREADY_DELIVERED') {
        patchItem(id, {
          status: 'ALREADY_DELIVERED',
          matchedCode: confirmed.waybill.waybill_code,
          message: `Vận đơn ${confirmed.waybill.waybill_code} vừa được báo phát trước thao tác này. Hệ thống không gắn nhầm ảnh.`,
        });
        return;
      }
      patchItem(id, {
        status: 'SUCCESS',
        matchedCode: confirmed.waybill.waybill_code,
        message: `Đã gắn ảnh và cập nhật ${confirmed.waybill.waybill_code} thành báo phát thành công.`,
      });
      navigator.vibrate?.(80);
    } catch (error) {
      patchItem(id, { status: 'ERROR', message: error instanceof Error ? error.message : 'Không lưu được ảnh báo phát.' });
    }
  };

  const enqueueItem = (id: string, file: File, previewUrl: string) => {
    processingQueueRef.current = processingQueueRef.current
      .then(() => processItem(id, file, previewUrl))
      .catch(() => undefined);
  };

  const addProofFiles = (selectedFiles: File[]) => {
    const files = selectedFiles.filter(file => file.type.startsWith('image/') || /\.(?:avif|gif|heic|heif|jpe?g|png|webp)$/i.test(file.name));
    if (!files.length) return;
    const additions = files.map<ProofItem>(file => ({
      id: createItemId(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'PROCESSING',
      detectedCode: null,
      matchedCode: null,
      message: 'Đang xếp hàng nhận diện...',
    }));
    setItems(current => [...additions, ...current]);
    additions.forEach(item => enqueueItem(item.id, item.file, item.previewUrl));
  };

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    addProofFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const addCameraCapture = (file: File) => {
    setIsCameraOpen(false);
    addProofFiles([file]);
  };

  const retry = (item: ProofItem) => enqueueItem(item.id, item.file, item.previewUrl);
  const clearResults = () => {
    items.forEach(item => URL.revokeObjectURL(item.previewUrl));
    setItems([]);
  };

  return (
    <div className="min-h-full bg-slate-50/70 p-3 sm:p-5 lg:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="border-b border-border bg-gradient-to-r from-emerald-50 via-white to-sky-50 px-5 py-5 sm:px-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm"><ScanBarcode size={23} /></span>
                <div>
                  <h1 className="text-xl font-black text-foreground">Báo phát</h1>
                  <p className="mt-1 max-w-2xl text-[13px] font-medium leading-5 text-muted-foreground">Chụp hoặc tải ảnh phiếu vận đơn đã có chữ ký. Hệ thống đọc mã, đối chiếu đúng vận đơn, lưu ảnh và cập nhật báo phát ngay.</p>
                </div>
              </div>
              {items.length > 0 && <button type="button" onClick={clearResults} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 text-[13px] font-bold text-muted-foreground hover:bg-muted"><Trash2 size={16} /> Xóa kết quả</button>}
            </div>
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6">
            <button type="button" onClick={() => setIsCameraOpen(true)} className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/60 px-4 text-center hover:bg-emerald-50">
              <Camera size={25} className="text-emerald-700" />
              <span className="text-[14px] font-black text-emerald-800">Chụp ảnh phiếu có chữ ký</span>
              <span className="text-[11px] font-semibold text-emerald-700/75">Mở camera trực tiếp trên máy tính hoặc điện thoại</span>
            </button>
            <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50/60 px-4 text-center hover:bg-sky-50">
              <ImagePlus size={25} className="text-sky-700" />
              <span className="text-[14px] font-black text-sky-800">Tải một hoặc nhiều ảnh</span>
              <span className="text-[11px] font-semibold text-sky-700/75">Mỗi ảnh chỉ được gắn theo mã đọc từ chính ảnh đó</span>
              <input type="file" accept={IMAGE_UPLOAD_ACCEPT} multiple onChange={addFiles} className="sr-only" />
            </label>
          </div>
        </section>

        {items.length > 0 && (
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <SummaryCard label="Đã chọn" value={summary.total} className="text-slate-700" />
            <SummaryCard label="Thành công" value={summary.success} className="text-emerald-700" />
            <SummaryCard label="Không đọc được" value={summary.unreadable} className="text-amber-700" />
            <SummaryCard label="Không tồn tại" value={summary.notFound} className="text-rose-700" />
            <SummaryCard label="Đã báo phát" value={summary.already} className="text-violet-700" />
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="border-b border-border px-5 py-4"><h2 className="text-[15px] font-black text-foreground">Kết quả theo từng ảnh</h2></div>
          {items.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
              <FileQuestion size={38} className="text-slate-300" />
              <p className="mt-3 text-[14px] font-black text-slate-700">Chưa có ảnh báo phát</p>
              <p className="mt-1 text-[12px] font-medium text-muted-foreground">Chụp hoặc chọn ảnh để hệ thống tự xử lý.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {items.map(item => <ProofResultRow key={item.id} item={item} onRetry={() => retry(item)} />)}
            </div>
          )}
        </section>
      </div>
      <ProofCameraDialog open={isCameraOpen} onClose={() => setIsCameraOpen(false)} onCaptured={addCameraCapture} onFallbackFiles={(files) => { setIsCameraOpen(false); addProofFiles(files); }} />
    </div>
  );
}

function SummaryCard({ label, value, className }: { label: string; value: number; className: string }) {
  return <div className="rounded-xl border border-border bg-white px-4 py-3 shadow-sm"><p className="text-[11px] font-bold text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-black ${className}`}>{value}</p></div>;
}

function ProofResultRow({ item, onRetry }: { item: ProofItem; onRetry: () => void }) {
  const terminalError = ['UNREADABLE', 'NOT_FOUND', 'ERROR'].includes(item.status);
  return (
    <div className="grid gap-4 p-4 sm:grid-cols-[112px_minmax(0,1fr)_auto] sm:items-center sm:px-5">
      <img src={item.previewUrl} alt={`Ảnh báo phát ${item.file.name}`} className="h-24 w-28 rounded-xl border border-border bg-slate-100 object-cover" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${statusStyle[item.status]}`}>
            {item.status === 'PROCESSING' ? <Loader2 size={13} className="animate-spin" /> : item.status === 'SUCCESS' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
            {proofResultLabel(item.status)}
          </span>
          {(item.matchedCode || item.detectedCode) && <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[12px] font-black text-slate-800">{item.matchedCode || item.detectedCode}</span>}
        </div>
        <p className="mt-2 truncate text-[12px] font-bold text-slate-600" title={item.file.name}>{item.file.name}</p>
        <p className="mt-1 text-[12px] font-medium leading-5 text-muted-foreground">{item.message}</p>
      </div>
      {terminalError && <button type="button" onClick={onRetry} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border bg-white px-3 text-[12px] font-black text-slate-700 hover:bg-muted"><RefreshCw size={14} /> Thử lại</button>}
    </div>
  );
}
