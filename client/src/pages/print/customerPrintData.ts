import type { CustomerListItem } from '../warehouse/customers/types';
import { customerAddress, customerPhone } from '../warehouse/customers/customerOrderPatch';
import type { WaybillPrintData } from './waybillPrintUtils';

const WALK_IN_CUSTOMER_CODES = new Set(['KHACHLE', 'KL']);

function isWalkInCustomer(code: string): boolean {
  return WALK_IN_CUSTOMER_CODES.has(code.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''));
}

export function mergeCustomerIntoPrintData(
  base: WaybillPrintData,
  customer: CustomerListItem,
): WaybillPrintData {
  const phone = customerPhone(customer);
  const address = customerAddress(customer);

  return {
    ...base,
    maKhGui: customer.code,
    // Khách lẻ được phép nhập tên người gửi riêng trên từng bill.
    tenKhGui: isWalkInCustomer(customer.code)
      ? base.tenKhGui.trim() || customer.name
      : customer.name,
    diaChiGui: address || base.diaChiGui,
    sdtGui: phone || base.sdtGui,
    dichVu: customer.price_table?.toUpperCase().includes('BỘ') ? 'ĐƯỜNG BỘ' : base.dichVu,
  };
}
