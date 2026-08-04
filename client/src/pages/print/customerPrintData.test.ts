import { describe, expect, it } from 'vitest';
import type { CustomerListItem } from '../warehouse/customers/types';
import type { WaybillPrintData } from './waybillPrintUtils';
import { mergeCustomerIntoPrintData } from './customerPrintData';

const base = {
  tenKhGui: 'C Đào Kho HCM',
  diaChiGui: '',
  sdtGui: '',
  dichVu: 'TIÊU CHUẨN 72H',
} as WaybillPrintData;

const customer = (code: string, name: string): CustomerListItem => ({
  id: '1',
  code,
  name,
  status: 'ACTIVE',
  discount_percent: 0,
} as CustomerListItem);

describe('mergeCustomerIntoPrintData', () => {
  it('keeps the sender name entered on a KHACHLE bill', () => {
    const result = mergeCustomerIntoPrintData(base, customer('KHACHLE', 'Khách lẻ'));

    expect(result.tenKhGui).toBe('C Đào Kho HCM');
    expect(result.maKhGui).toBe('KHACHLE');
  });

  it('falls back to the customer name when a walk-in bill has no entered sender name', () => {
    const result = mergeCustomerIntoPrintData(
      { ...base, tenKhGui: '   ' },
      customer('KL', 'Khách lẻ'),
    );

    expect(result.tenKhGui).toBe('Khách lẻ');
  });

  it('continues using the customer master name for normal customer codes', () => {
    const result = mergeCustomerIntoPrintData(base, customer('HAICHANG', 'Hải Chang'));

    expect(result.tenKhGui).toBe('Hải Chang');
  });
});
