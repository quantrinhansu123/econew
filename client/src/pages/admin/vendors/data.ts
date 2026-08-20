import type { FilterOption } from './types';

export type VendorTableColumnId =
  | 'code'
  | 'name'
  | 'service_type'
  | 'contact_name'
  | 'phone'
  | 'province'
  | 'contract_type'
  | 'payable_balance'
  | 'status'
  | 'actions';

export const statusOptions: FilterOption[] = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'INACTIVE', label: 'Tạm tắt' },
];

export const serviceTypeOptions: FilterOption[] = [
  { value: '', label: 'Tất cả loại dịch vụ' },
  { value: 'DUONG_TRUC', label: 'Đường trục' },
  { value: 'CHANH_XE', label: 'Chành xe' },
  { value: 'NOI_THANH', label: 'Nội thành' },
];

export const contractTypeOptions: FilterOption[] = [
  { value: '', label: 'Tất cả loại hợp đồng' },
  { value: 'THEO_CHUYEN', label: 'Theo chuyến' },
  { value: 'THEO_THANG', label: 'Theo tháng' },
  { value: 'THEO_KG', label: 'Theo kg' },
];

export const provinceOptions: FilterOption[] = [
  { value: '', label: 'Tất cả khu vực' },
  { value: 'HAN', label: 'Hà Nội' },
  { value: 'HCM', label: 'TP.HCM' },
  { value: 'MIEN_BAC', label: 'Miền Bắc' },
  { value: 'MIEN_NAM', label: 'Miền Nam' },
];

export const vendorTableHeaders: Array<{ id: VendorTableColumnId; label: string; className?: string; locked?: boolean }> = [
  { id: 'code', label: 'Mã NCC', locked: true },
  { id: 'name', label: 'Tên NCC', locked: true },
  { id: 'service_type', label: 'Loại dịch vụ' },
  { id: 'contact_name', label: 'Người liên hệ' },
  { id: 'phone', label: 'SĐT' },
  { id: 'province', label: 'Khu vực' },
  { id: 'contract_type', label: 'Loại HĐ' },
  { id: 'payable_balance', label: 'Công nợ phải trả' },
  { id: 'status', label: 'Trạng thái' },
  { id: 'actions', label: 'Thao tác', className: 'w-[220px] min-w-[220px]', locked: true },
];

export const defaultVisibleVendorColumns = vendorTableHeaders.map(header => header.id);
export const defaultVendorColumnOrder = vendorTableHeaders.map(header => header.id);

export const vendorFormFields = [
  'code',
  'name',
  'service_type',
  'contact_name',
  'phone',
  'email',
  'opening_debt',
  'bank_name',
  'bank_account',
  'bank_account_holder',
  'qr_image_url',
  'province',
  'contract_type',
  'status',
] as const;

export const serviceTypeFormOptions = serviceTypeOptions.filter(option => option.value);
export const contractTypeFormOptions = contractTypeOptions.filter(option => option.value);
export const provinceFormOptions = provinceOptions.filter(option => option.value);

export const parseListValues = (value?: string | null) =>
  value
    ? value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    : [];

export const joinListValues = (values: string[]) => Array.from(new Set(values.map(item => item.trim()).filter(Boolean))).join(',');

export const formatServiceType = (value?: string | null) => {
  if (!value) return '—';
  return parseListValues(value)
    .map(part => serviceTypeOptions.find(option => option.value === part)?.label || part)
    .join(', ') || '—';
};

export const formatContractType = (value?: string | null) => {
  if (!value) return '—';
  return parseListValues(value)
    .map(part => contractTypeOptions.find(option => option.value === part)?.label || part)
    .join(', ') || '—';
};

export const formatProvince = (value?: string | null) => {
  if (!value) return '—';
  return parseListValues(value)
    .map(part => provinceOptions.find(option => option.value === part)?.label || part)
    .join(', ') || '—';
};

export const formatStatus = (value?: string | null) =>
  statusOptions.find(option => option.value === value)?.label || value || '—';
