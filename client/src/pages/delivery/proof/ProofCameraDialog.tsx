import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Camera, ImagePlus, Loader2, RefreshCw, X } from 'lucide-react';
import { IMAGE_UPLOAD_ACCEPT } from '../../../lib/uploadImage';
import { cameraFailureMessage, createCameraCaptureFile } from './cameraCaptureUtils';

type CameraState = 'STARTING' | 'LIVE' | 'ERROR';

interface Props {
  open: boolean;
  onClose: () => void;
  onCaptured: (file: File) => void;
  onFallbackFiles: (files: File[]) => void;
}

export default function ProofCameraDialog({ open, onClose, onCaptured, onFallbackFiles }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>('STARTING');
  const [message, setMessage] = useState('Đang mở camera...');
  const [restartKey, setRestartKey] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;

    const stopCamera = () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    const startCamera = async () => {
      stopCamera();
      setCameraState('STARTING');
      setMessage('Đang mở camera...');
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraState('ERROR');
        setMessage('Trình duyệt không hỗ trợ camera trực tiếp tại địa chỉ này. Chị có thể chọn ảnh thay thế.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        if (!videoRef.current) throw new Error('CAMERA_PREVIEW_MISSING');
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraState('LIVE');
        setMessage('Đặt trọn phiếu vận đơn trong khung, giữ rõ mã vạch rồi bấm Chụp và báo phát.');
      } catch (error) {
        if (cancelled) return;
        stopCamera();
        setCameraState('ERROR');
        setMessage(cameraFailureMessage(error));
      }
    };

    void startCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, restartKey]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || cameraState !== 'LIVE' || !video.videoWidth || !video.videoHeight) {
      setCameraState('ERROR');
      setMessage('Camera chưa sẵn sàng. Hãy thử mở lại camera.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraState('ERROR');
      setMessage('Không tạo được ảnh từ camera. Hãy chọn ảnh thay thế.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraState('ERROR');
        setMessage('Không lưu được ảnh vừa chụp. Hãy thử lại.');
        return;
      }
      onCaptured(createCameraCaptureFile(blob));
    }, 'image/jpeg', 0.92);
  };

  const chooseFallback = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length) onFallbackFiles(files);
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/80 p-3 sm:p-5">
      <section className="flex max-h-[96dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"><Camera size={20} /></span>
            <div className="min-w-0">
              <h2 className="text-[16px] font-black text-foreground">Chụp ảnh báo phát</h2>
              <p className="truncate text-[11px] font-semibold text-muted-foreground">Ảnh chụp sẽ tự nhận mã, lưu lên đơn và báo phát ngay</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng camera" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"><X size={19} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-950 p-3 sm:p-4">
          <div className="relative mx-auto aspect-[4/3] max-h-[65dvh] overflow-hidden rounded-2xl border border-white/20 bg-black">
            <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain" />
            {cameraState !== 'LIVE' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center text-white">
                {cameraState === 'STARTING' ? <Loader2 size={32} className="animate-spin text-emerald-400" /> : <AlertCircle size={34} className="text-amber-400" />}
                <p className="max-w-md text-[13px] font-semibold leading-5 text-slate-200">{message}</p>
                {cameraState === 'ERROR' && <button type="button" onClick={() => setRestartKey(current => current + 1)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-[13px] font-extrabold text-white hover:bg-white/15"><RefreshCw size={16} /> Thử mở lại</button>}
              </div>
            )}
            {cameraState === 'LIVE' && <div className="pointer-events-none absolute inset-[7%] rounded-xl border-2 border-emerald-400/90 shadow-[0_0_0_999px_rgba(2,6,23,0.12)]" />}
          </div>
          <p className="mx-auto mt-3 max-w-xl text-center text-[12px] font-semibold leading-5 text-slate-200">{message}</p>
        </div>

        <footer className="grid gap-2 border-t border-border bg-white p-3 sm:grid-cols-2 sm:p-4">
          <button type="button" onClick={capture} disabled={cameraState !== 'LIVE'} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-[14px] font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><Camera size={18} /> Chụp và báo phát</button>
          <label className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 text-[13px] font-extrabold text-foreground hover:bg-muted">
            <ImagePlus size={18} /> Chọn ảnh thay thế
            <input type="file" accept={IMAGE_UPLOAD_ACCEPT} onChange={chooseFallback} className="sr-only" />
          </label>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
