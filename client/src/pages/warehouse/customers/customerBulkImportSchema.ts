export type CustomerBulkFieldKey =
  | 'code'
  | 'name'
  | 'short_name'
  | 'mobile'
  | 'phone_landline'
  | 'address'
  | 'destination_province'
  | 'receiver_hcm'
  | 'phone_hcm'
  | 'address_hcm'
  | 'email'
  | 'contact_person'
  | 'manager_name'
  | 'price_table'
  | 'discount_percent'
  | 'opening_debt'
  | 'delivery_handler'
  | 'region'
  | 'credit_type'
  | 'contract_code'
  | 'tax_id'
  | 'status';

export interface CustomerBulkColumn {
  key: CustomerBulkFieldKey;
  label: string;
  required: boolean;
  sample?: string;
}

export const CUSTOMER_BULK_COLUMNS: CustomerBulkColumn[] = [
  { key: 'code', label: 'Mã KH', required: true, sample: 'ALPHATIC' },
  { key: 'name', label: 'Tên KH', required: true, sample: 'Công ty ABC' },
  { key: 'short_name', label: 'Tên tắt', required: false, sample: 'ABC' },
  { key: 'mobile', label: 'Điện thoại KH', required: false, sample: '0901234567' },
  { key: 'phone_landline', label: 'Điện thoại bàn', required: false, sample: '' },
  { key: 'address', label: 'Địa chỉ gửi', required: false, sample: 'Thanh Trì, Hà Nội' },
  { key: 'destination_province', label: 'Tỉnh đến mặc định', required: false, sample: 'HCM' },
  { key: 'receiver_hcm', label: 'Người nhận HCM', required: false, sample: 'Nguyễn Văn A' },
  { key: 'phone_hcm', label: 'ĐT nhận HCM', required: false, sample: '0888727897' },
  { key: 'address_hcm', label: 'Địa chỉ kho HCM', required: false, sample: '215 Nguyễn Trãi, Q.1, TP.HCM' },
  { key: 'email', label: 'Email', required: false, sample: '' },
  { key: 'contact_person', label: 'Người liên hệ', required: false, sample: '' },
  { key: 'manager_name', label: 'NV quản lý', required: false, sample: '' },
  { key: 'price_table', label: 'Bảng giá', required: false, sample: 'TIÊU CHUẨN 72H' },
  { key: 'discount_percent', label: 'Chiết khấu %', required: false, sample: '0' },
  { key: 'opening_debt', label: 'Công nợ tồn cũ', required: false, sample: '1500000' },
  { key: 'delivery_handler', label: 'Giao nhận', required: false, sample: 'ADMIN' },
  { key: 'region', label: 'Khu vực', required: false, sample: '' },
  { key: 'credit_type', label: 'Công nợ', required: false, sample: 'K' },
  { key: 'contract_code', label: 'Mã hợp đồng', required: false, sample: '' },
  { key: 'tax_id', label: 'Mã số thuế', required: false, sample: '' },
  { key: 'status', label: 'Trạng thái', required: false, sample: 'ACTIVE' },
];

export const CUSTOMER_BULK_TEMPLATE_NOTES: Partial<Record<CustomerBulkFieldKey, string>> = {
  code: 'bắt buộc; dùng để tạo mới hoặc cập nhật',
  name: 'bắt buộc',
  mobile: 'định dạng Text để giữ số 0 đầu',
  phone_landline: 'định dạng Text để giữ số 0 đầu',
  receiver_hcm: 'dùng khi tỉnh nhận là HCM',
  phone_hcm: 'dùng khi tỉnh nhận là HCM',
  address_hcm: 'dùng khi tỉnh nhận là HCM',
  discount_percent: 'để trống mặc định 0 khi tạo mới',
  opening_debt: 'số dư công nợ chốt từ kỳ cũ; để trống mặc định 0',
  status: 'ACTIVE hoặc SUSPENDED; để trống là ACTIVE',
};

export const CUSTOMER_BULK_INSTRUCTIONS = [
  'Cột có dấu * là bắt buộc. Mỗi Mã KH chỉ nhập một dòng trong file.',
  'Mã KH chưa có sẽ được tạo mới; Mã KH đã có sẽ được cập nhật.',
  'Khi cập nhật, ô Excel để trống sẽ giữ nguyên dữ liệu cũ.',
  'Điện thoại có thể viết liền, có khoảng trắng, dấu chấm hoặc dấu gạch; hệ thống chỉ lưu phần số.',
  'Nên định dạng các cột điện thoại là Text để Excel không bỏ số 0 đầu.',
  'Kho HCM gồm Người nhận HCM, ĐT nhận HCM và Địa chỉ kho HCM.',
  'Công nợ tồn cũ là số dư đầu kỳ và sẽ tự cộng vào công nợ hiện tại của khách hàng.',
  'Trạng thái chỉ nhận ACTIVE (Hoạt động) hoặc SUSPENDED (Tạm dừng).',
  'Dòng mẫu được hệ thống tự bỏ qua; nhập dữ liệu thật từ dòng kế tiếp.',
];

export function customerBulkHeaderLabel(column: CustomerBulkColumn) {
  return column.required ? `${column.label}*` : column.label;
}
