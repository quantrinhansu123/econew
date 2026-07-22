import { useState, type ReactNode } from 'react';
import { CalendarDays, Check, Edit3, Loader2, Package, Printer, Trash2, X } from 'lucide-react';
import { DateTimePicker } from '../../../../components/ui/DateTimePicker';
import { hubDeliveryLabelFromWaybill, parseDeliveryPhotos } from '../manifestHubUtils';
import { canRemoveWaybillsFromManifest } from '../types';
import type { BadgeConfig, LoadPlanningManifest, ManifestWaybill } from '../types';
import ManifestExpensesSection from './ManifestExpensesSection';

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  isLoading: boolean;
  isSubmitting?: boolean;
  manifest: LoadPlanningManifest | null;
  statusConfig: Record<string, BadgeConfig>;
  canManage: boolean;
  canManageExpenses?: boolean;
  canDeleteExpenses?: boolean;
  showHubDeliveryStatus?: boolean;
  onClose: () => void;
  onRemoveWaybill: (waybill: ManifestWaybill) => void;
  onUpdateDispatchFields?: (waybill: ManifestWaybill, fields: Record<string, string>) => Promise<void> | void;
  onUpdateExpectedArrival?: (manifest: LoadPlanningManifest, value: string) => Promise<void> | void;
}

type EditableFields = { ghi_chu_1: string; ghi_chu_2: string; ke_hoach: string; lai_xe_thu_ho: string };

const display = (value?: string | number | null, fallback = '—') => value == null || value === '' ? fallback : String(value);
const num = (value?: string | number | null, suffix = '') => value == null || value === '' ? '—' : `${Number(value).toLocaleString('vi-VN')}${suffix}`;
const code = (manifest: LoadPlanningManifest) => manifest.manifest_code || manifest.code || `MF-${manifest.id}`;
const manifestTrip = (manifest: LoadPlanningManifest) => manifest.trip ?? manifest.trips?.[0] ?? null;
const expectedArrival = (manifest: LoadPlanningManifest) => manifestTrip(manifest)?.expected_arrival_time || manifestTrip(manifest)?.arrival_time || null;
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const toDateTimeLocalValue = (value?: string | null) => { if (!value) return ''; const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
const badge = (status?: string | null, config?: BadgeConfig) => <span className={`inline-flex h-7 items-center rounded-full px-3 text-[12px] font-bold ${config?.className || 'bg-slate-100 text-slate-600'}`}>{config?.label || status || '—'}</span>;
const extractWaybills = (manifest: LoadPlanningManifest | null): ManifestWaybill[] => manifest?.waybills?.length ? manifest.waybills : (manifest?.manifest_waybills || []).map((link) => link.waybill ? { ...link.waybill, loading_position: link.loading_position ?? link.waybill.loading_position, dispatch_fields: { ...(link.waybill.dispatch_fields ?? {}), ...(link.dispatch_fields ?? {}) } } : null).filter(Boolean) as ManifestWaybill[];
const contactName = (value?: string | null) => display((value || '').split('|')[0]?.trim(), display(value));
const contactAddress = (value?: string | null) => (value || '').split('|').slice(2).join(' | ').trim() || display(value, '');
const dispatchValue = (waybill: ManifestWaybill, key: string) => display(waybill.dispatch_fields?.[key] as string | number | null | undefined, '');
const destinationName = (waybill: ManifestWaybill) => dispatchValue(waybill, 'noi_tra') || waybill.dest_hub?.name || waybill.dest_hub?.code || display(waybill.noi_den || waybill.dest_hub_id, '');
const editableValues = (waybill: ManifestWaybill): EditableFields => ({ ghi_chu_1: dispatchValue(waybill, 'ghi_chu_1'), ghi_chu_2: dispatchValue(waybill, 'ghi_chu_2'), ke_hoach: dispatchValue(waybill, 'ke_hoach'), lai_xe_thu_ho: dispatchValue(waybill, 'lai_xe_thu_ho') });

export default function ManifestDetailDialog({ isOpen, isClosing, isLoading, isSubmitting = false, manifest, statusConfig, canManage, canManageExpenses = false, canDeleteExpenses = false, showHubDeliveryStatus = false, onClose, onRemoveWaybill, onUpdateDispatchFields, onUpdateExpectedArrival }: Props) {
  if (!isOpen) return null;
  const waybills = extractWaybills(manifest);
  const mayRemoveWaybill = canManage && canRemoveWaybillsFromManifest(manifest);

  return <div className="manifest-detail-print-root fixed inset-0 z-[9999] flex justify-end print:static print:block print:bg-white">
    <style>{`@media print { body > *:not(.manifest-detail-print-root) { display: none !important; } .manifest-detail-print-root { display: block !important; position: static !important; inset: auto !important; background: #fff !important; } .manifest-detail-print-panel { display: block !important; width: 100% !important; max-width: none !important; height: auto !important; min-height: 0 !important; border: 0 !important; box-shadow: none !important; } .manifest-detail-print-toolbar { display: none !important; } .manifest-detail-print-main { display: block !important; overflow: visible !important; padding: 0 !important; } }`}</style>
    <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm transition-all duration-300 print:hidden" onClick={onClose} />
    <div className={`manifest-detail-print-panel relative flex h-screen w-full max-w-[min(1280px,98vw)] flex-col border-l border-border bg-[#f8fafc] shadow-2xl ${isClosing ? 'dialog-slide-out' : 'dialog-slide-in'}`}>
      <header className="manifest-detail-print-toolbar flex shrink-0 items-center justify-between border-b border-border bg-white px-6 py-4">
        <div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">Chi tiết bảng kê</p><h2 className="mt-1 truncate text-2xl font-black text-foreground">{manifest ? code(manifest) : 'Đang tải'}</h2></div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => manifest && window.open(`/print/manifest/${manifest.id}`, '_blank', 'noopener')} disabled={isLoading || !manifest} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-[13px] font-black text-emerald-700 shadow-sm hover:bg-emerald-100 disabled:opacity-50"><Printer size={18} />In bảng kê</button>
          <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-white text-muted-foreground shadow-sm hover:bg-muted"><X size={20} /></button>
        </div>
      </header>

      <main className="manifest-detail-print-main min-h-0 flex-1 overflow-auto p-5 custom-scrollbar">
        {isLoading ? <State label="Đang tải chi tiết bảng kê..." /> : !manifest ? <State label="Không tìm thấy bảng kê." /> : <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Info label="Trạng thái" value={badge(manifest.status, statusConfig[String(manifest.status || '')])} />
            <Info label="Hub đi" value={display(manifest.origin_hub?.code || manifest.origin_hub?.name || manifest.origin_hub_id)} />
            <Info label="Hub đến" value={display(manifest.dest_hub?.code || manifest.dest_hub?.name || manifest.dest_hub_id)} />
            <Info label="Seal" value={display(manifest.seal_code)} mono />
            <Info label="Ngày dự kiến đến" value={<ExpectedArrivalEditor manifest={manifest} canManage={canManage && !!onUpdateExpectedArrival} isSubmitting={isSubmitting} onUpdateExpectedArrival={onUpdateExpectedArrival} />} />
          </section>

          <ManifestExpensesSection
            key={`${manifest.id}-${manifestTrip(manifest)?.id ?? manifest.trip_id ?? 'no-trip'}`}
            manifest={manifest}
            canManage={canManageExpenses}
            canDelete={canDeleteExpenses}
          />

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-blue-50 via-white to-emerald-50 px-5 py-4">
              <div className="flex items-center gap-3"><span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Package size={18} /></span><div><p className="text-[12px] font-black uppercase tracking-[0.14em] text-primary">Bảng kê phát hàng ECO</p><p className="text-[12px] font-semibold text-slate-600">{waybills.length} vận đơn · dữ liệu đóng xe và giao nhận</p></div></div>
              <div className="flex flex-wrap gap-2 text-[12px] font-bold"><span className="rounded-full bg-white px-3 py-1.5 text-slate-600 ring-1 ring-slate-200">{display(manifest.origin_hub?.code || manifest.origin_hub_id)} → {display(manifest.dest_hub?.code || manifest.dest_hub_id)}</span><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700 ring-1 ring-emerald-100">{waybills.length} dòng hàng</span></div>
            </div>
            <div className="overflow-auto custom-scrollbar">
              <table className="hidden w-full min-w-[1040px] table-fixed border-separate border-spacing-0 text-left md:table">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-600 shadow-sm">
                  <tr><Header className="w-[50px] text-center">Vị trí</Header><Header className="w-[70px]">Ngày bốc</Header><Header className="w-[86px]">Mã tỉnh</Header><Header className="w-[118px]">Tên CTY / DV</Header><Header className="w-[128px]">Mặt hàng / Bill</Header><Header className="w-[170px]">Nơi trả / Địa chỉ</Header><Header className="w-[70px] text-right">SL / ĐVT</Header>{showHubDeliveryStatus && <Header className="w-[120px]">TT giao</Header>}{showHubDeliveryStatus && <Header className="w-[90px]">Ảnh</Header>}<Header className="w-[140px]">Ghi chú</Header><Header className="w-[100px]">Kế hoạch</Header><Header className="w-[108px] text-right">Thu hộ</Header><Header className="w-[100px] text-right">KG / M3 / QĐ</Header>{mayRemoveWaybill && <Header className="w-[52px] text-center">Gỡ</Header>}</tr>
                </thead>
                <tbody>{waybills.map((waybill, index) => <WaybillRow key={waybill.id} waybill={waybill} index={index} canManage={canManage && !!onUpdateDispatchFields} isSubmitting={isSubmitting} showHubDeliveryStatus={showHubDeliveryStatus} mayRemoveWaybill={mayRemoveWaybill} onRemoveWaybill={onRemoveWaybill} onUpdateDispatchFields={onUpdateDispatchFields} />)}</tbody>
              </table>
              <div className="grid gap-3 p-3 md:hidden">{waybills.map((waybill) => <article key={waybill.id} className="rounded-2xl border border-border bg-white p-4 text-[13px] shadow-sm"><div className="mb-3 text-base font-black text-primary">{display(waybill.waybill_code)}</div><Line label="Người gửi" value={contactName(waybill.sender_info)} /><Line label="Người nhận" value={contactName(waybill.receiver_info)} /><Line label="Trọng lượng" value={num(waybill.weight, ' kg')} /><Line label="Thanh toán" value={display(waybill.payment_type)} /></article>)}</div>
              {!waybills.length && <State label="Bảng kê chưa có vận đơn." />}
            </div>
          </section>
        </div>}
      </main>
    </div>
  </div>;
}

function ExpectedArrivalEditor({ manifest, canManage, isSubmitting, onUpdateExpectedArrival }: { manifest: LoadPlanningManifest; canManage: boolean; isSubmitting: boolean; onUpdateExpectedArrival?: (manifest: LoadPlanningManifest, value: string) => Promise<void> | void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(() => toDateTimeLocalValue(expectedArrival(manifest)));
  const canEditArrival = canManage;
  const startEdit = () => { setValue(toDateTimeLocalValue(expectedArrival(manifest))); setIsEditing(true); };
  const save = async () => { if (!onUpdateExpectedArrival) return; await onUpdateExpectedArrival(manifest, value); setIsEditing(false); };
  if (isEditing) return <div className="space-y-2"><DateTimePicker value={value} onChange={setValue} disabled={isSubmitting} placeholder="Chọn ngày đến" className="w-full" /><div className="flex gap-2"><button disabled={isSubmitting} onClick={() => void save()} className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-2 text-[11px] font-black text-white disabled:opacity-60">{isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Lưu</button><button disabled={isSubmitting} onClick={() => setIsEditing(false)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-black text-slate-600 disabled:opacity-60"><X size={13} />Hủy</button></div></div>;
  return <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1"><CalendarDays size={14} />{formatDate(expectedArrival(manifest))}</span>{canEditArrival && <button onClick={startEdit} className="inline-flex h-8 items-center gap-1 rounded-lg border border-primary/20 bg-blue-50 px-2 text-[11px] font-black text-primary hover:bg-blue-100"><Edit3 size={13} />Sửa</button>}</div>;
}

function WaybillRow({ waybill, index, canManage, isSubmitting, showHubDeliveryStatus, mayRemoveWaybill, onRemoveWaybill, onUpdateDispatchFields }: { waybill: ManifestWaybill; index: number; canManage: boolean; isSubmitting: boolean; showHubDeliveryStatus?: boolean; mayRemoveWaybill?: boolean; onRemoveWaybill?: (waybill: ManifestWaybill) => void; onUpdateDispatchFields?: (waybill: ManifestWaybill, fields: Record<string, string>) => Promise<void> | void }) {
  const service = dispatchValue(waybill, 'dv') || 'TC';
  const bill = dispatchValue(waybill, 'ma_bill') || display(waybill.waybill_code, '');
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<EditableFields>(() => editableValues(waybill));
  const change = (key: keyof EditableFields, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  const startEdit = () => { setForm(editableValues(waybill)); setIsEditing(true); };
  const save = async () => { if (!onUpdateDispatchFields) return; await onUpdateDispatchFields(waybill, form); setIsEditing(false); };

  return <tr className="group align-top transition-colors hover:bg-blue-50/50">
    <Cell align="center"><span className="inline-flex h-8 min-w-8 items-center justify-center rounded-xl bg-amber-100 px-2 font-black text-amber-800 ring-1 ring-amber-200">{display(waybill.loading_position ?? index + 1)}</span></Cell>
    <Cell>{dispatchValue(waybill, 'ngay_boc')}</Cell>
    <Cell><HubChip>{dispatchValue(waybill, 'ma_tinh') || display(waybill.noi_den || waybill.dest_hub?.code || waybill.dest_hub_id, '')}</HubChip></Cell>
    <Cell strong><StackLines primary={dispatchValue(waybill, 'ten_cty') || contactName(waybill.sender_info)} secondary={<span className="inline-flex w-fit rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-700">{service}</span>} /></Cell>
    <Cell strong><StackLines primary={dispatchValue(waybill, 'mat_hang') || display(waybill.waybill_code, '')} secondary={<span className="whitespace-nowrap text-primary">Bill: {bill}</span>} /></Cell>
    <Cell><StackLines primary={destinationName(waybill)} secondary={dispatchValue(waybill, 'dia_chi') || contactAddress(waybill.receiver_info)} /></Cell>
    <Cell align="right" strong><StackLines primary={dispatchValue(waybill, 'so_luong') || display(waybill.package_count, '1')} secondary={dispatchValue(waybill, 'loai') || 'kiện'} /></Cell>
    {showHubDeliveryStatus && <Cell><span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-800">{hubDeliveryLabelFromWaybill(waybill)}</span></Cell>}
    {showHubDeliveryStatus && <Cell><div className="flex flex-wrap gap-1">{parseDeliveryPhotos(waybill.delivery_photo_url).map((photo, photoIndex) => <img key={photoIndex} src={photo} alt="" className="h-8 w-8 rounded border border-slate-200 object-cover" />)}</div></Cell>}
    <Cell>{isEditing ? <EditField value={form.ghi_chu_1} placeholder="Ghi chú 1" onChange={value => change('ghi_chu_1', value)} /> : <StackLines primary={dispatchValue(waybill, 'ghi_chu_1') || '—'} secondary={dispatchValue(waybill, 'ghi_chu_2') || dispatchValue(waybill, 'ghi_chu_bill')} />}{isEditing && <EditField className="mt-2" value={form.ghi_chu_2} placeholder="Ghi chú 2" onChange={value => change('ghi_chu_2', value)} />}</Cell>
    <Cell>{isEditing ? <EditField value={form.ke_hoach} placeholder="Kế hoạch" onChange={value => change('ke_hoach', value)} /> : dispatchValue(waybill, 'ke_hoach')}</Cell>
    <Cell align="right">{isEditing ? <EditField value={form.lai_xe_thu_ho} placeholder="Thu hộ" onChange={value => change('lai_xe_thu_ho', value)} /> : <StackLines primary={<span className="font-black text-slate-950">{dispatchValue(waybill, 'lai_xe_thu_ho') || '—'}</span>} secondary={`BC: ${dispatchValue(waybill, 'bc_thu_ho') || '—'}`} />}{canManage && <div className="mt-2 flex justify-end gap-1">{isEditing ? <><button title="Lưu" disabled={isSubmitting} onClick={save} className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white disabled:opacity-60"><Check size={14} /></button><button title="Hủy" disabled={isSubmitting} onClick={() => setIsEditing(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-60"><X size={14} /></button></> : <button onClick={startEdit} className="inline-flex h-8 items-center gap-1 rounded-lg border border-primary/20 bg-blue-50 px-2 text-[11px] font-black text-primary hover:bg-blue-100"><Edit3 size={13} />Sửa</button>}</div>}</Cell>
    <Cell align="right"><StackLines primary={<span className="font-black text-slate-950">{dispatchValue(waybill, 'kg') || display(waybill.weight, '') || '—'} kg</span>} secondary={`${dispatchValue(waybill, 'm3') || display(waybill.the_tich_m3 || waybill.volumetric_weight, '') || '—'} m3 · QĐ ${dispatchValue(waybill, 'qd') || '—'}`} /></Cell>
    {mayRemoveWaybill && <Cell align="center"><button type="button" title="Gỡ đơn" disabled={isSubmitting} onClick={() => onRemoveWaybill?.(waybill)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"><Trash2 size={14} /></button></Cell>}
  </tr>;
}

function Header({ children, className = '' }: { children: ReactNode; className?: string }) { return <th className={`border-b border-r border-slate-200 px-3 py-3 font-black last:border-r-0 ${className}`}>{children}</th>; }
function Cell({ children, className = '', align = 'left', strong = false }: { children: ReactNode; className?: string; align?: 'left' | 'center' | 'right'; strong?: boolean }) { const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'; return <td className={`overflow-hidden border-b border-r border-slate-100 px-3 py-3 text-[12px] leading-5 last:border-r-0 ${strong ? 'font-black text-slate-950' : 'font-semibold text-slate-700'} ${alignClass} ${className}`}>{children}</td>; }
function StackLines({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) { return <div className="flex min-w-0 flex-col gap-1"><div className="min-w-0 break-words">{primary || '—'}</div>{secondary ? <div className="min-w-0 break-words text-[11px] font-bold text-slate-500">{secondary}</div> : null}</div>; }
function EditField({ value, placeholder, className = '', onChange }: { value: string; placeholder: string; className?: string; onChange: (value: string) => void }) { return <input value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} className={`h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-bold text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10 ${className}`} />; }
function HubChip({ children }: { children: ReactNode }) { return <span className="inline-flex max-w-full rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-black leading-none text-indigo-700 ring-1 ring-indigo-100"><span className="block min-w-0 truncate">{children || '—'}</span></span>; }
function State({ label }: { label: string }) { return <div className="flex min-h-[260px] items-center justify-center text-[13px] font-bold text-muted-foreground">{label.includes('Đang') && <Loader2 className="mr-2 animate-spin" size={16} />}{label}</div>; }
function Info({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) { return <div className="rounded-3xl border border-border bg-white p-4 shadow-sm"><p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{label}</p><div className={`mt-3 text-[14px] font-black text-foreground ${mono ? 'break-all' : ''}`}>{value}</div></div>; }
function Line({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-3 py-1"><span className="text-muted-foreground">{label}</span><span className="text-right font-bold text-foreground">{value}</span></div>; }
