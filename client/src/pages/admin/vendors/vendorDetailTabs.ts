export type VendorDetailTabId = 'chi-tiet' | 'don-hang' | 'giao-hang' | 'bill' | 'thanh-toan';

export const VENDOR_DETAIL_TABS: { id: VendorDetailTabId; label: string }[] = [
  { id: 'chi-tiet', label: 'Chi tiết' },
  { id: 'don-hang', label: 'Chuyến phát sinh' },
  { id: 'giao-hang', label: 'Giao hàng' },
  { id: 'bill', label: 'Bill' },
  { id: 'thanh-toan', label: 'Thanh toán' },
];
