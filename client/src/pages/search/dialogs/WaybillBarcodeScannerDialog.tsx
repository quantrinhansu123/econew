import { Camera, ImagePlus, Loader2, ScanLine, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';

type ScannerState = 'starting' | 'live' | 'unavailable' | 'error';

const cameraErrorMessage = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Chưa được cấp quyền camera. Hãy cho phép camera hoặc chụp/chọn ảnh có mã.';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'Không tìm thấy camera trên thiết bị. Hãy chụp/chọn ảnh có mã.';
  }
  return 'Không mở được camera. Chị vẫn có thể chụp hoặc chọn ảnh có mã bên dưới.';
};

export default function WaybillBarcodeScannerDialog({
  open,
  onClose,
  onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (value: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const onDetectedRef = useRef(onDetected);
  const handledRef = useRef(false);
  const [scannerState, setScannerState] = useState<ScannerState>('starting');
  const [message, setMessage] = useState('Đang mở camera sau...');
  const [isDecodingImage, setIsDecodingImage] = useState(false);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    handledRef.current = false;

    const stopCamera = () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
      const stream = videoRef.current?.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    const startCamera = async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setScannerState('unavailable');
        setMessage('Camera trực tiếp cần HTTPS. Khi test bằng IP local, hãy bấm “Chụp ảnh mã” bên dưới.');
        return;
      }

      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled || !videoRef.current) return;
        const reader = new BrowserMultiFormatReader();
        readerRef.current = reader;
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          videoRef.current,
          (result, _error, scannerControls) => {
            const value = result?.getText().trim();
            if (!value || handledRef.current) return;
            handledRef.current = true;
            scannerControls.stop();
            navigator.vibrate?.(80);
            onDetectedRef.current(value);
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setScannerState('live');
        setMessage('Đưa barcode hoặc QR vào giữa khung. Hệ thống sẽ tự nhận mã.');
      } catch (error) {
        if (cancelled) return;
        stopCamera();
        setScannerState('error');
        setMessage(cameraErrorMessage(error));
      }
    };

    void startCamera();
    return () => {
      cancelled = true;
      stopCamera();
      readerRef.current = null;
    };
  }, [open]);

  const decodeImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    controlsRef.current?.stop();
    controlsRef.current = null;
    setIsDecodingImage(true);
    setMessage('Đang đọc mã trong ảnh...');
    const imageUrl = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      const result = await reader.decodeFromImageUrl(imageUrl);
      const value = result.getText().trim();
      if (!value) throw new Error('EMPTY_BARCODE');
      handledRef.current = true;
      navigator.vibrate?.(80);
      onDetectedRef.current(value);
    } catch {
      setScannerState('error');
      setMessage('Không đọc được barcode/QR trong ảnh. Hãy chụp rõ, đủ sáng và để toàn bộ mã nằm trong khung hình.');
    } finally {
      URL.revokeObjectURL(imageUrl);
      setIsDecodingImage(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/75 p-3 sm:p-5">
      <div className="flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
              <ScanLine size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="text-[16px] font-black text-foreground">Quét mã vận đơn</h2>
              <p className="truncate text-[11px] font-semibold text-muted-foreground">Hỗ trợ barcode và QR trên bill</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted" aria-label="Đóng quét mã">
            <X size={19} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-950 p-3 sm:p-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/20 bg-black">
            <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
            {scannerState !== 'live' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center text-white">
                {scannerState === 'starting' ? <Loader2 size={30} className="animate-spin text-blue-400" /> : <Camera size={34} className="text-slate-400" />}
                <p className="max-w-sm text-[13px] font-semibold text-slate-200">{message}</p>
              </div>
            )}
            {scannerState === 'live' && (
              <>
                <div className="pointer-events-none absolute inset-[15%] rounded-2xl border-2 border-emerald-400 shadow-[0_0_0_999px_rgba(2,6,23,0.38)]" />
                <div className="pointer-events-none absolute left-[18%] right-[18%] top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.9)]" />
              </>
            )}
          </div>

          <p className="mt-3 text-center text-[12px] font-semibold text-slate-200">{scannerState === 'live' ? message : 'Nếu camera trực tiếp không mở, dùng nút chụp ảnh bên dưới.'}</p>
        </div>

        <div className="grid gap-2 border-t border-border bg-white p-3 sm:grid-cols-2">
          <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-extrabold text-white hover:bg-primary/90">
            {isDecodingImage ? <Loader2 size={17} className="animate-spin" /> : <Camera size={17} />}
            Chụp ảnh mã
            <input type="file" accept="image/*" capture="environment" disabled={isDecodingImage} onChange={decodeImage} className="sr-only" />
          </label>
          <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 text-[13px] font-extrabold text-foreground hover:bg-muted">
            <ImagePlus size={17} />
            Chọn ảnh có mã
            <input type="file" accept="image/*" disabled={isDecodingImage} onChange={decodeImage} className="sr-only" />
          </label>
        </div>
      </div>
    </div>,
    document.body,
  );
}
