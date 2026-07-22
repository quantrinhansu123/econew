import type { CustomerFormState, CustomerRecord } from './customerFormTypes';
import type { CustomerListItem } from './types';

const str = (v: string | null | undefined) => v ?? '';

export function customerToForm(source: CustomerListItem | CustomerRecord): CustomerFormState {
  return {
    code: str(source.code),
    name: str(source.name),
    short_name: str(source.short_name),
    destination_province: str(source.destination_province),
    receiver_han: str('receiver_han' in source ? source.receiver_han : null),
    address_han: str('address_han' in source ? source.address_han : null),
    phone_han: str('phone_han' in source ? source.phone_han : null),
    receiver_hcm: str('receiver_hcm' in source ? source.receiver_hcm : null),
    address_hcm: str(source.address_hcm),
    phone_hcm: str(source.phone_hcm),
    receiver_dng: str('receiver_dng' in source ? source.receiver_dng : null),
    email: str(source.email),
    contact_person: str(source.contact_person),
    manager_name: str(source.manager_name),
    price_table: str(source.price_table),
    discount_percent: String(source.discount_percent ?? 0),
    delivery_handler: str(source.delivery_handler),
    status: source.is_suspended || source.status === 'SUSPENDED' ? 'SUSPENDED' : source.status || 'ACTIVE',
    mobile: str(source.mobile),
    address: str(source.address),
    region: str(source.region),
    credit_type: str(source.credit_type),
    contract_code: str('contract_code' in source ? source.contract_code : source.code),
    tax_id: str(source.tax_id),
    phone_landline: str(source.phone_landline),
    address_dng: str('address_dng' in source ? source.address_dng : null),
    phone_dng: str('phone_dng' in source ? source.phone_dng : null),
  };
}

export function formToPayload(form: CustomerFormState, isEdit: boolean) {
  const trim = (s: string) => s.trim();
  const optional = (s: string) => {
    const v = trim(s);
    return v || undefined;
  };

  const payload: Record<string, unknown> = {
    name: trim(form.name),
    short_name: optional(form.short_name),
    destination_province: optional(form.destination_province),
    receiver_han: optional(form.receiver_han),
    address_han: optional(form.address_han),
    phone_han: optional(form.phone_han),
    receiver_hcm: optional(form.receiver_hcm),
    address_hcm: optional(form.address_hcm),
    phone_hcm: optional(form.phone_hcm),
    receiver_dng: optional(form.receiver_dng),
    email: optional(form.email),
    contact_person: optional(form.contact_person),
    manager_name: optional(form.manager_name),
    price_table: optional(form.price_table),
    discount_percent: Number(form.discount_percent) || 0,
    delivery_handler: optional(form.delivery_handler),
    status: form.status,
    is_suspended: form.status === 'SUSPENDED',
    mobile: optional(form.mobile),
    address: optional(form.address),
    region: optional(form.region),
    credit_type: optional(form.credit_type),
    contract_code: optional(form.contract_code),
    tax_id: optional(form.tax_id),
    phone_landline: optional(form.phone_landline),
    address_dng: optional(form.address_dng),
    phone_dng: optional(form.phone_dng),
  };

  if (!isEdit) {
    payload.code = trim(form.code).toUpperCase();
  } else if (trim(form.code)) {
    payload.code = trim(form.code).toUpperCase();
  }

  return payload;
}

export function validateCustomerForm(form: CustomerFormState, isEdit: boolean): string | null {
  if (!isEdit && !form.code.trim()) return 'Vui lòng nhập mã khách hàng.';
  if (!form.name.trim()) return 'Vui lòng nhập tên khách hàng.';
  return null;
}
