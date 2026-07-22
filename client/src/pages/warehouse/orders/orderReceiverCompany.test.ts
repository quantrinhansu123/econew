import { describe, expect, it } from 'vitest';
import { emptyOrderForm } from './orderFormData';
import { buildCreatePayload, waybillToOrderForm } from './orderFormUtils';

describe('receiver company on order form', () => {
  it('saves the manually entered receiver company separately from the contact', () => {
    const form = {
      ...emptyOrderForm(),
      tenCongTyNhan: 'Công ty ABC',
      nguoiNhan: 'Chị Lan',
      dienThoaiNhan: '0938938112',
    };

    const payload = buildCreatePayload(form, 0);

    expect(payload.receiver_company_name).toBe('Công ty ABC');
    expect(payload.receiver_name).toBe('Chị Lan');
    expect(payload.receiver_phone).toBe('0938938112');
    expect(payload.note).toContain('receiver_company_name=Công ty ABC');
  });

  it('loads the saved receiver company when editing an existing bill', () => {
    const form = waybillToOrderForm({
      id: '1',
      receiver_company_name: 'Công ty XYZ',
      receiver_info: 'Anh Nam | 0901234567 | HCM',
      receiver_phone: '0901234567',
      receiver_address: 'HCM',
    }, []);

    expect(form.tenCongTyNhan).toBe('Công ty XYZ');
    expect(form.nguoiNhan).toBe('Anh Nam');
    expect(form.dienThoaiNhan).toBe('0901234567');
  });

  it('stores the final delivery province separately from the destination HUB', () => {
    const payload = buildCreatePayload({
      ...emptyOrderForm(),
      originHubId: '1',
      destHubId: '2',
      noiDen: 'HCM',
      huyen: 'Khánh Hòa',
      quanHuyen: 'Nha Trang',
      phuongXa: 'Phước Hải',
      diaChiNhan: '12 Lê Hồng Phong, Nha Trang',
    }, 0);

    expect(payload.dest_hub_id).toBe('2');
    expect(payload.noi_den).toBe('Khánh Hòa');
    expect(payload.note).toContain('quan_huyen=Nha Trang');
    expect(payload.note).toContain('phuong_xa=Phước Hải');
  });

  it('does not save an unprefixed ward as the receiver province', () => {
    const payload = buildCreatePayload({
      ...emptyOrderForm(),
      originHubId: '1',
      destHubId: '2',
      huyen: '',
      diaChiNhan: '165 Thạch Xuân, Thới An',
    }, 0);

    expect(payload.noi_den).toBeUndefined();
    expect(payload.note).not.toContain('tinh_den=Thới An');
  });

  it('loads the destination HUB province for a legacy bill without receiver province metadata', () => {
    const form = waybillToOrderForm({
      id: '59',
      receiver_address: '165 Thạch Xuân, Thới An',
      dest_hub: {
        id: '2',
        code: 'HCM',
        name: 'Bưu cục Hồ Chí Minh',
        province: 'Hồ Chí Minh',
      },
    }, []);

    expect(form.huyen).toBe('Hồ Chí Minh');
    expect(form.quanHuyen).toBe('');
  });
});
