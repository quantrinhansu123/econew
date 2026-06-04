import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { AlertCircle, Eye, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { ApiError, apiRequest } from '../../lib/api';

type FieldType = 'text' | 'number' | 'date' | 'time' | 'password';

interface FieldConfig {
  key: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  hiddenInTable?: boolean;
  hiddenInDetail?: boolean;
  createOnly?: boolean;
}

interface BusinessConfig {
  title: string;
  description: string;
  endpoint: string;
  fields: FieldConfig[];
}

interface ListResponse {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
}

const commonMoneyFields = new Set(['amount', 'unit_price', 'transfer_fee', 'total_amount', 'cod_amount', 'external_vehicle_cost', 'customer_discount', 'final_profit', 'carrier_holding_amount', 'bo_fee', 'income_amount', 'expense_amount']);

export const businessPageConfigs: Record<string, BusinessConfig> = {
  vehicleDirectory: { title: 'Danh sách xe', description: 'Quản lý lái xe, khu vực, nhà xe, BKS và loại xe.', endpoint: '/vehicle-directory', fields: fields(['driver_name:Họ tên lái xe', 'region:Khu vực', 'carrier_name:Nhà xe', 'license_plate:BKS', 'vehicle_type:Loại xe']) },
  vehicleCosts: { title: 'Chi phí xe', description: 'Theo dõi chi phí phát sinh theo BKS và trạng thái xử lý.', endpoint: '/vehicle-costs', fields: fields(['cost_date:Ngày:date', 'license_plate:BKS', 'vehicle_type:Loại xe', 'cost_type:Loại CP', 'amount:Số tiền:number', 'status:Trạng thái']) },
  cashTransactionDetails: { title: 'Thu chi CT', description: 'Quản lý phiếu thu chi chi tiết gắn với chi phí xe.', endpoint: '/cash-transaction-details', fields: fields(['vehicle_cost_id:ID chi phí:number', 'voucher_type:Loại phiếu', 'voucher_name:Tên phiếu', 'service_type:Loại DV', 'counterparty_unit:Đơn vị thu chi', 'content:Nội dung', 'performed_by:Người thực hiện', 'entry_date:Ngày:date', 'entry_time:Giờ:time', 'note:Ghi chú', 'amount:Số tiền:number']) },
  northSouthShipments: { title: 'Vận tải Bắc Nam', description: 'Quản lý bill vận tải, doanh thu, chi phí và lợi nhuận cuối.', endpoint: '/north-south-shipments', fields: fields(['bill:Bill', 'goods_name:Tên hàng', 'package_count:Số kiện:number', 'volume:Số khối:number', 'weight:Số cân:number', 'service_type:Dịch vụ', 'destination:Nơi đến', 'address:Địa chỉ', 'unit:ĐVT', 'unit_price:Đơn giá:number', 'transfer_fee:Trung chuyển:number', 'total_amount:Thành tiền:number', 'cod_amount:Thu hộ khách:number', 'payment_method:Hình thức thanh toán', 'note:Ghi chú', 'pickup_vehicle_status:TT xe lấy hàng', 'external_vehicle_cost:Cước xe ngoài:number', 'external_vehicle_payment_method:Hình thức tt xe ngoài', 'customer_discount:Chiết khấu khách:number', 'final_profit:Lợi nhuận cuối:number', 'carrier_holding_amount:Nhà xe cầm:number']) },
  staffMembers: { title: 'Nhân sự', description: 'Quản lý nhân sự nội bộ; mật khẩu chỉ dùng khi tạo/cập nhật.', endpoint: '/staff-members', fields: fields(['full_name:Họ và tên', 'department:Bộ phận', 'position:Vị trí', 'phone:SĐT', 'password:Password:password:createOnly']) },
  carrierDirectory: { title: 'Nhà xe', description: 'Danh mục nhà cung cấp/nhà xe theo khu vực và biển số.', endpoint: '/carrier-directory', fields: fields(['region:Khu vực', 'carrier_name:NHÀ CC', 'license_plate:BKS']) },
  chanhShipments: { title: 'Chành', description: 'Quản lý vận chuyển chành theo tỉnh, công ty, nhà xe và bill.', endpoint: '/chanh-shipments', fields: fields(['province_code:Mã tỉnh', 'bill_count:Số bill:number', 'company_name:Tên CTY', 'goods_name:Mặt hàng', 'quantity:Số lượng:number', 'goods_type:Loại hàng', 'unit_price:Đơn giá:number', 'cost_type:Loại CP', 'note:Ghi chú', 'carrier_name:Nhà xe', 'license_plate:BSX', 'shipment_date:Ngày:date', 'bo_fee:Cước bo:number', 'bill:Bill']) },
  customerDirectory: { title: 'Khách hàng', description: 'Danh mục khách hàng theo mã, số điện thoại và địa chỉ.', endpoint: '/customer-directory', fields: fields(['full_name:Họ và tên', 'phone:SĐT', 'address:Địa chỉ', 'customer_code:Mã KH']) },
  cashJournalEntries: { title: 'Nhật ký thu chi', description: 'Ghi nhận thu nhập và chi phí theo nguồn/phân loại.', endpoint: '/cash-journal-entries', fields: fields(['entry_date:Ngày tháng:date', 'voucher_type:Loại phiếu', 'source:Nguồn', 'cost_category:Phân loại chi phí', 'detail:Chi tiết', 'note:Ghi chú', 'content:Nội dung', 'income_amount:Thu nhập:number', 'expense_amount:Chi phí:number']) },
  warehouses: { title: 'Kho', description: 'Danh mục kho vận hành.', endpoint: '/warehouses', fields: fields(['warehouse_name:Tên kho']) },
};

export function BusinessCrudPage({ configKey }: { configKey: keyof typeof businessPageConfigs }) {
  const config = businessPageConfigs[configKey];
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const limit = 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const tableFields = useMemo(() => config.fields.filter((field) => !field.hiddenInTable && field.type !== 'password').slice(0, 8), [config.fields]);

  useEffect(() => { void loadRows(); }, [config.endpoint, page]);

  async function loadRows(nextQ = q) {
    setIsLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (nextQ.trim()) params.set('q', nextQ.trim());
      const payload = await apiRequest<ListResponse>(`${config.endpoint}?${params}`);
      setRows(payload.data ?? []); setTotal(payload.total ?? 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được dữ liệu.');
    } finally { setIsLoading(false); }
  }

  function openCreate() {
    setEditing(null);
    setForm(Object.fromEntries(config.fields.map((field) => [field.key, ''])));
    setIsFormOpen(true);
  }

  function openEdit(row: Record<string, unknown>) {
    setEditing(row);
    setForm(Object.fromEntries(config.fields.map((field) => [field.key, field.type === 'password' ? '' : String(row[field.key] ?? '')])));
    setIsFormOpen(true);
  }

  async function submitForm(event: FormEvent) {
    event.preventDefault(); setError('');
    const payload = Object.fromEntries(config.fields.filter((field) => !(field.createOnly && editing)).map((field) => [field.key, form[field.key] ?? '']).filter(([, value]) => value !== ''));
    try {
      if (editing) await apiRequest(`${config.endpoint}/${editing.id}`, { method: 'PATCH', body: payload });
      else await apiRequest(config.endpoint, { method: 'POST', body: payload });
      setIsFormOpen(false); await loadRows();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không lưu được dữ liệu.');
    }
  }

  async function removeRow(row: Record<string, unknown>) {
    if (!window.confirm(`Xóa bản ghi #${row.id}?`)) return;
    try { await apiRequest(`${config.endpoint}/${row.id}`, { method: 'DELETE' }); await loadRows(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Không xóa được dữ liệu.'); }
  }

  function search(event: FormEvent) { event.preventDefault(); setPage(1); void loadRows(q); }

  return <div className="space-y-5 p-4 sm:p-6">
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><h1 className="text-2xl font-bold text-foreground">{config.title}</h1><p className="mt-1 text-sm text-muted-foreground">{config.description}</p></div>
        <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-primary/90"><Plus size={16} /> Thêm mới</button>
      </div>
      <form onSubmit={search} className="mt-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Tìm kiếm nhanh..." className="w-full rounded-xl border border-border py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" /></div>
        <button className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"><RefreshCw size={16} /> Tải lại</button>
      </form>
    </div>

    {error && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle size={16} />{error}</div>}

    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      {isLoading ? <State icon={<Loader2 className="animate-spin" />} title="Đang tải dữ liệu" /> : rows.length === 0 ? <State icon={<AlertCircle />} title="Chưa có dữ liệu" /> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-border text-sm"><thead className="bg-muted/40"><tr><th className="px-4 py-3 text-left font-bold">ID</th>{tableFields.map((field) => <th key={field.key} className="px-4 py-3 text-left font-bold">{field.label}</th>)}<th className="px-4 py-3 text-right font-bold">Thao tác</th></tr></thead><tbody className="divide-y divide-border">{rows.map((row) => <tr key={String(row.id)} className="hover:bg-muted/20"><td className="px-4 py-3 font-semibold">{formatValue(row.id)}</td>{tableFields.map((field) => <td key={field.key} className="px-4 py-3">{formatField(row[field.key], field)}</td>)}<td className="px-4 py-3"><div className="flex justify-end gap-2"><IconButton title="Xem" onClick={() => setDetail(row)}><Eye size={15} /></IconButton><IconButton title="Sửa" onClick={() => openEdit(row)}><Pencil size={15} /></IconButton><IconButton title="Xóa" danger onClick={() => void removeRow(row)}><Trash2 size={15} /></IconButton></div></td></tr>)}</tbody></table></div>}
      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground"><span>Tổng {total} bản ghi</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-border px-3 py-1 disabled:opacity-50">Trước</button><span>Trang {page}/{totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-lg border border-border px-3 py-1 disabled:opacity-50">Sau</button></div></div>
    </div>

    {isFormOpen && <Modal title={editing ? `Sửa ${config.title}` : `Thêm ${config.title}`} onClose={() => setIsFormOpen(false)}><form onSubmit={submitForm} className="grid grid-cols-1 gap-4 sm:grid-cols-2">{config.fields.filter((field) => !(field.createOnly && editing)).map((field) => <label key={field.key} className="space-y-1 text-sm font-semibold text-foreground"><span>{field.label}{field.required !== false && <span className="text-red-500"> *</span>}</span><input type={field.type === 'password' ? 'password' : field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : field.type === 'number' ? 'number' : 'text'} step={field.type === 'number' ? '0.01' : undefined} value={form[field.key] ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))} className="w-full rounded-xl border border-border px-3 py-2 outline-none focus:border-primary" /></label>)}<div className="flex justify-end gap-3 sm:col-span-2"><button type="button" onClick={() => setIsFormOpen(false)} className="rounded-xl border border-border px-4 py-2 font-semibold">Hủy</button><button className="rounded-xl bg-primary px-4 py-2 font-bold text-white">Lưu</button></div></form></Modal>}
    {detail && <Modal title={`Chi tiết ${config.title}`} onClose={() => setDetail(null)}><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{config.fields.filter((field) => !field.hiddenInDetail && field.type !== 'password').map((field) => <Info key={field.key} label={field.label} value={formatField(detail[field.key], field)} />)}<Info label="ID" value={formatValue(detail.id)} /></div></Modal>}
  </div>;
}

function fields(definitions: string[]): FieldConfig[] {
  return definitions.map((definition) => {
    const [key, label, type, marker] = definition.split(':');
    return { key, label, type: type as FieldType | undefined, createOnly: marker === 'createOnly' };
  });
}

function formatField(value: unknown, field: FieldConfig) {
  if (commonMoneyFields.has(field.key)) return formatMoney(value);
  return formatValue(value);
}

function formatValue(value: unknown) { return value === null || value === undefined || value === '' ? '—' : String(value); }
function formatMoney(value: unknown) { const amount = Number(value ?? 0); return Number.isFinite(amount) ? amount.toLocaleString('vi-VN') : formatValue(value); }
function State({ icon, title }: { icon: ReactNode; title: string }) { return <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 text-muted-foreground">{icon}<p className="font-semibold">{title}</p></div>; }
function IconButton({ title, children, danger, onClick }: { title: string; children: ReactNode; danger?: boolean; onClick: () => void }) { return <button title={title} onClick={onClick} className={`rounded-lg border p-2 transition-colors ${danger ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-border text-muted-foreground hover:bg-muted'}`}>{children}</button>; }
function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-xl"><div className="sticky top-0 flex items-center justify-between border-b border-border bg-white px-5 py-4"><h2 className="text-lg font-bold">{title}</h2><button onClick={onClose} className="rounded-lg p-2 hover:bg-muted"><X size={18} /></button></div><div className="p-5">{children}</div></div></div>; }
function Info({ label, value }: { label: string; value: ReactNode }) { return <div className="rounded-xl border border-border bg-muted/10 p-3"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p><div className="mt-1 font-semibold text-foreground">{value}</div></div>; }

export default BusinessCrudPage;
