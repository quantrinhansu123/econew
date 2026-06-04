import { useEffect, useMemo, useState } from 'react';
import type { ComponentType, InputHTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Banknote, Building2, CalendarClock, Info, Loader2, Package, Truck as TruckIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/api';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { ConfirmDialog, type ConfirmDialogState } from '../components/ui/ConfirmDialog';
import type { AuthUserProfile } from './login/types';
import CreateTripSuccessDialog from './trips/dialogs/CreateTripSuccessDialog';
import type { ListResponse, Trip, TripCreateFieldErrors, TripCreateFormState, TripCreateHubSummary, TripCreateManifestSummary, TripCreatePayload, TripCreateTruckSummary } from './trips/types';

const USER_PROFILE_KEY = 'eco_user_profile';
const DISPATCHER = 8;
const MANAGER = 32;
const DIRECTOR = 64;

const emptyForm: TripCreateFormState = {
  truck_id: '',
  manifest_id: '',
  start_hub_id: '',
  end_hub_id: '',
  departure_time: '',
  arrival_time: '',
  trip_cost: '',
};

const getStoredUser = (): AuthUserProfile | null => {
  const raw = localStorage.getItem(USER_PROFILE_KEY) || sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUserProfile;
  } catch {
    return null;
  }
};

const normalizeId = (value: string | number | null | undefined) => (value == null ? '' : String(value));
const normalizeList = <T,>(response: ListResponse<T> | T[], key: 'trucks' | 'manifests' | 'hubs'): T[] =>
  Array.isArray(response) ? response : response[key] ?? response.data ?? response.items ?? [];
const hasPermission = (roleMask: number) => (roleMask & (DISPATCHER | MANAGER | DIRECTOR)) !== 0;
const toApiId = (value: string) => (/^\d+$/.test(value) ? Number(value) : value);
const toApiDateTime = (value: string) => (value ? new Date(value).toISOString() : '');
const formatNumber = (value?: number | string | null, suffix = '') =>
  value == null || value === '' ? '—' : `${new Intl.NumberFormat('vi-VN').format(Number(value))}${suffix}`;

const addDaysToDatetimeLocal = (datetimeLocal: string, days: number): string => {
  if (!datetimeLocal) return '';
  const d = new Date(datetimeLocal);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const warningText = (item?: { warning?: string | null; warnings?: string[] | null } | null) =>
  [item?.warning, ...(item?.warnings ?? [])].filter(Boolean).join(' · ');

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-[12px] font-bold text-red-500">{message}</p> : null;
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="md:col-span-2 border-b border-border pb-2 text-[11px] font-black uppercase tracking-wider text-primary">
      {children}
    </div>
  );
}

function FormInput({
  label,
  icon: Icon,
  error,
  required,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  error?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={clsx('block', className)}>
      <span className="text-[13px] font-bold text-foreground">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <div className="relative mt-1.5">
        <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          {...props}
          className={clsx(
            'h-10 w-full rounded-lg border border-border bg-muted/10 px-3 pl-9 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/10',
            error && 'border-red-300 bg-red-50/40',
          )}
        />
      </div>
      <FieldError message={error} />
    </label>
  );
}

function InfoCard({
  title,
  icon: Icon,
  children,
  warning,
}: {
  title: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  children: ReactNode;
  warning?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/10 p-4">
      <div className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wider text-primary">
        <Icon size={15} />
        {title}
      </div>
      <div className="mt-3 space-y-1 text-[13px] font-medium text-muted-foreground">{children}</div>
      {warning && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-700">
          <AlertTriangle className="mr-1.5 inline" size={14} />
          {warning}
        </div>
      )}
    </div>
  );
}

export default function TripNewPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<TripCreateFormState>(emptyForm);
  const [errors, setErrors] = useState<TripCreateFieldErrors>({});
  const [trucks, setTrucks] = useState<TripCreateTruckSummary[]>([]);
  const [manifests, setManifests] = useState<TripCreateManifestSummary[]>([]);
  const [hubs, setHubs] = useState<TripCreateHubSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [createdTrip, setCreatedTrip] = useState<Trip | null>(null);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [arrivalTouched, setArrivalTouched] = useState(false);

  const user = useMemo(getStoredUser, []);
  const canCreate = hasPermission(user?.role_mask ?? 0);
  const selectedTruck = trucks.find((truck) => normalizeId(truck.id) === form.truck_id);
  const selectedManifest = manifests.find((manifest) => normalizeId(manifest.id) === form.manifest_id);
  const supplierName =
    selectedTruck?.vendor?.name || selectedTruck?.nha_xe || (selectedTruck ? '—' : '');

  const truckOptions = useMemo(
    () =>
      trucks.map((truck) => ({
        value: normalizeId(truck.id),
        label: [
          truck.bks || truck.license_plate || `Xe #${truck.id}`,
          truck.vendor?.name || truck.nha_xe,
          truck.status,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    [trucks],
  );
  const manifestOptions = useMemo(
    () =>
      manifests.map((manifest) => ({
        value: normalizeId(manifest.id),
        label: [manifest.manifest_code || `Bảng kê #${manifest.id}`, manifest.status].filter(Boolean).join(' · '),
      })),
    [manifests],
  );
  const hubOptions = useMemo(
    () =>
      hubs.map((hub) => ({
        value: normalizeId(hub.id),
        label: [hub.code, hub.name].filter(Boolean).join(' · ') || `Hub #${hub.id}`,
      })),
    [hubs],
  );

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError('');
    Promise.all([
      apiRequest<ListResponse<TripCreateTruckSummary> | TripCreateTruckSummary[]>('/trucks/available', {
        signal: controller.signal,
      }),
      apiRequest<ListResponse<TripCreateManifestSummary> | TripCreateManifestSummary[]>('/manifests?status=CLOSED', {
        signal: controller.signal,
      }),
      apiRequest<ListResponse<TripCreateHubSummary> | TripCreateHubSummary[]>('/hubs/active', {
        signal: controller.signal,
      }),
    ])
      .then(([truckResponse, manifestResponse, hubResponse]) => {
        setTrucks(normalizeList(truckResponse, 'trucks'));
        setManifests(normalizeList(manifestResponse, 'manifests'));
        setHubs(normalizeList(hubResponse, 'hubs'));
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setLoadError(err instanceof ApiError ? err.message : 'Không tải được dữ liệu xe, bảng kê hoặc bưu cục.');
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, []);

  const setField = <K extends keyof TripCreateFormState>(key: K, value: TripCreateFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleDepartureChange = (value: string) => {
    setField('departure_time', value);
    if (!arrivalTouched && value) {
      setField('arrival_time', addDaysToDatetimeLocal(value, 3));
    }
  };

  const handleManifestChange = (value: string) => {
    const manifest = manifests.find((item) => normalizeId(item.id) === value);
    setForm((prev) => ({
      ...prev,
      manifest_id: value,
      start_hub_id: normalizeId(manifest?.origin_hub_id ?? manifest?.origin_hub?.id ?? prev.start_hub_id),
      end_hub_id: normalizeId(manifest?.dest_hub_id ?? manifest?.dest_hub?.id ?? prev.end_hub_id),
    }));
    setErrors((prev) => ({ ...prev, manifest_id: undefined, start_hub_id: undefined, end_hub_id: undefined }));
  };

  const validate = () => {
    const nextErrors: TripCreateFieldErrors = {};
    if (!form.truck_id) nextErrors.truck_id = 'Bắt buộc chọn biển kiểm soát.';
    if (!form.manifest_id) nextErrors.manifest_id = 'Bắt buộc chọn bảng kê.';
    if (!form.start_hub_id) nextErrors.start_hub_id = 'Bắt buộc chọn bưu cục đi.';
    if (!form.end_hub_id) nextErrors.end_hub_id = 'Bắt buộc chọn bưu cục đến.';
    if (!form.departure_time) nextErrors.departure_time = 'Bắt buộc nhập giờ khởi hành.';
    if (form.arrival_time && form.departure_time && new Date(form.arrival_time) <= new Date(form.departure_time)) {
      nextErrors.arrival_time = 'Giờ đến phải sau giờ khởi hành.';
    }
    if (form.trip_cost && Number(form.trip_cost) < 0) nextErrors.trip_cost = 'Chi phí không được âm.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const buildPayload = (): TripCreatePayload => ({
    truck_id: toApiId(form.truck_id),
    manifest_id: toApiId(form.manifest_id),
    start_hub_id: toApiId(form.start_hub_id),
    end_hub_id: toApiId(form.end_hub_id),
    departure_time: toApiDateTime(form.departure_time),
    ...(form.arrival_time ? { arrival_time: toApiDateTime(form.arrival_time) } : {}),
    ...(form.trip_cost ? { trip_cost: Number(form.trip_cost) } : {}),
  });

  const createTrip = async () => {
    setIsSubmitting(true);
    setActionError('');
    try {
      const trip = await apiRequest<Trip>('/trips', { method: 'POST', body: buildPayload() });
      setCreatedTrip(trip);
      setIsSuccessOpen(true);
      if (trip?.id) {
        setIsLoadingDetail(true);
        try {
          setCreatedTrip(await apiRequest<Trip>(`/trips/${trip.id}`));
        } catch {
          setCreatedTrip(trip);
        } finally {
          setIsLoadingDetail(false);
        }
      }
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Không thể tạo chuyến xe.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submit = () => {
    if (!canCreate || !validate()) return;
    const warnings = [warningText(selectedTruck), warningText(selectedManifest)].filter(Boolean);
    if (warnings.length) {
      setConfirmDialog({
        title: 'Xác nhận tạo chuyến',
        message: `Có cảnh báo: ${warnings.join(' · ')}. Tiếp tục?`,
        confirmLabel: 'Tạo chuyến',
        onConfirm: createTrip,
      });
      return;
    }
    void createTrip();
  };

  const resetForAnother = () => {
    setForm(emptyForm);
    setErrors({});
    setActionError('');
    setCreatedTrip(null);
    setIsSuccessOpen(false);
    setArrivalTouched(false);
  };

  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => navigate('/trips')}
          className="h-10 w-10 shrink-0 rounded-lg border border-border bg-muted/10 text-[13px] font-medium text-muted-foreground hover:bg-muted flex items-center justify-center gap-2 md:w-auto md:px-3"
        >
          <ArrowLeft size={15} />
          <span className="hidden md:inline">Quay lại</span>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[20px] font-black text-foreground">Tạo chuyến xe mới</h1>
          <p className="text-[13px] font-medium text-muted-foreground">
            Chọn BKS, bảng kê, thời gian và chi phí chuyến (cộng công nợ NCC).
          </p>
        </div>
        <button
          disabled={!canCreate || isSubmitting || isLoading}
          onClick={submit}
          className="bg-primary text-white rounded-lg px-6 py-2 font-bold hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 inline animate-spin" size={15} />
              Đang lưu
            </>
          ) : (
            'Lưu'
          )}
        </button>
      </div>

      {!canCreate && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-700">
          <AlertTriangle className="mr-2 inline" size={16} />
          Cần quyền DISPATCHER, MANAGER hoặc DIRECTOR.
        </div>
      )}
      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-bold text-red-600">
          <AlertTriangle className="mr-2 inline" size={16} />
          {loadError}
        </div>
      )}
      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-bold text-red-600">
          <AlertTriangle className="mr-2 inline" size={16} />
          {actionError}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        {isLoading ? (
          <div className="flex min-h-[360px] items-center justify-center text-[13px] font-bold text-muted-foreground">
            <Loader2 className="mr-2 animate-spin text-primary" size={18} />
            Đang tải dữ liệu...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionTitle>Liên kết chuyến xe</SectionTitle>
            <label className="block md:col-span-2">
              <span className="text-[13px] font-bold text-foreground">
                Biển kiểm soát (BKS) <span className="text-red-500">*</span>
              </span>
              <SearchableSelect
                options={truckOptions}
                value={form.truck_id}
                onValueChange={(value) => setField('truck_id', value)}
                placeholder="Chọn BKS"
                className={clsx('mt-1.5 h-10 rounded-lg', errors.truck_id && 'border-red-300')}
              />
              {form.truck_id && (
                <p className="mt-2 flex items-center gap-2 text-[13px] font-bold text-primary">
                  <Building2 size={15} />
                  Nhà cung cấp: {supplierName}
                </p>
              )}
              <FieldError message={errors.truck_id} />
            </label>
            <label className="block">
              <span className="text-[13px] font-bold text-foreground">
                Bảng kê <span className="text-red-500">*</span>
              </span>
              <SearchableSelect
                options={manifestOptions}
                value={form.manifest_id}
                onValueChange={handleManifestChange}
                placeholder="Chọn bảng kê đã đóng (CLOSED)"
                className={clsx('mt-1.5 h-10 rounded-lg', errors.manifest_id && 'border-red-300')}
              />
              <FieldError message={errors.manifest_id} />
            </label>
            {selectedTruck && (
              <InfoCard title="Thông tin xe" icon={TruckIcon} warning={warningText(selectedTruck)}>
                <p>
                  <b className="text-foreground">BKS:</b> {selectedTruck.bks || selectedTruck.license_plate}
                </p>
                <p>Tải trọng: {formatNumber(selectedTruck.payload, ' kg')} · TT: {selectedTruck.status || '—'}</p>
              </InfoCard>
            )}
            {selectedManifest && (
              <InfoCard title="Bảng kê" icon={Package} warning={warningText(selectedManifest)}>
                <p>
                  <b className="text-foreground">Mã:</b> {selectedManifest.manifest_code || `#${selectedManifest.id}`}
                </p>
                <p>Seal: {selectedManifest.seal_code || '—'}</p>
              </InfoCard>
            )}

            <SectionTitle>Bưu cục và thời gian</SectionTitle>
            <label className="block">
              <span className="text-[13px] font-bold text-foreground">
                Bưu cục đi <span className="text-red-500">*</span>
              </span>
              <SearchableSelect
                options={hubOptions}
                value={form.start_hub_id}
                onValueChange={(value) => setField('start_hub_id', value)}
                placeholder="Chọn bưu cục đi"
                className={clsx('mt-1.5 h-10 rounded-lg', errors.start_hub_id && 'border-red-300')}
              />
              <FieldError message={errors.start_hub_id} />
            </label>
            <label className="block">
              <span className="text-[13px] font-bold text-foreground">
                Bưu cục đến <span className="text-red-500">*</span>
              </span>
              <SearchableSelect
                options={hubOptions}
                value={form.end_hub_id}
                onValueChange={(value) => setField('end_hub_id', value)}
                placeholder="Chọn bưu cục đến"
                className={clsx('mt-1.5 h-10 rounded-lg', errors.end_hub_id && 'border-red-300')}
              />
              <FieldError message={errors.end_hub_id} />
            </label>
            <FormInput
              label="Giờ khởi hành"
              icon={CalendarClock}
              required
              type="datetime-local"
              value={form.departure_time}
              onChange={(event) => handleDepartureChange(event.target.value)}
              error={errors.departure_time}
            />
            <FormInput
              label="Giờ đến (mặc định +3 ngày, có thể sửa)"
              icon={CalendarClock}
              type="datetime-local"
              value={form.arrival_time}
              onChange={(event) => {
                setArrivalTouched(true);
                setField('arrival_time', event.target.value);
              }}
              error={errors.arrival_time}
            />

            <SectionTitle>Chi phí & công nợ NCC</SectionTitle>
            <FormInput
              label="Chi phí chuyến xe (VNĐ)"
              icon={Banknote}
              type="number"
              min="0"
              step="1000"
              placeholder="VD: 28000000"
              value={form.trip_cost}
              onChange={(event) => setField('trip_cost', event.target.value)}
              error={errors.trip_cost}
              className="md:col-span-2"
            />
            <div className="md:col-span-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-[13px] font-medium text-blue-700">
              <Info className="mr-2 inline" size={15} />
              Chi phí chuyến được cộng vào <b>công nợ phải trả</b> của nhà cung cấp sở hữu BKS đã chọn. Giờ khởi
              hành có thể chọn ngày trong quá khứ hoặc tương lai.
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog dialog={confirmDialog} isSubmitting={isSubmitting} onClose={() => setConfirmDialog(null)} />
      <CreateTripSuccessDialog
        isOpen={isSuccessOpen}
        trip={createdTrip}
        isLoadingDetail={isLoadingDetail}
        onClose={() => setIsSuccessOpen(false)}
        onList={() => navigate('/trips')}
        onDetail={() => createdTrip?.id && navigate(`/trips/${createdTrip.id}`)}
        onCreateAnother={resetForAnother}
      />
    </div>
  );
}
