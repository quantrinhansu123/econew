import { describe, expect, it } from 'vitest';
import { emptyOrderForm } from './orderFormData';
import { buildCreatePayload, waybillToBillItem, waybillToOrderForm } from './orderFormUtils';

describe('receiver company on order form', () => {
  it('stores and restores special goods selections in bill metadata', () => {
    const form = {
      ...emptyOrderForm(),
      specialGoods: ['RETURN_DOCUMENTS', 'LIQUID'],
    };
    const payload = buildCreatePayload(form, 0);
    expect(payload.note).toContain('special_goods=RETURN_DOCUMENTS,LIQUID');

    const restored = waybillToOrderForm({ id: '1', note: payload.note } as any, []);
    expect(restored.specialGoods).toEqual(['RETURN_DOCUMENTS', 'LIQUID']);
  });

  it('stores and restores the VAT invoice request', () => {
    const payload = buildCreatePayload({
      ...emptyOrderForm(),
      coVat: true,
    }, 0);

    expect(payload.note).toContain('co_vat=1');
    expect(waybillToOrderForm({ id: '1', note: payload.note } as any, []).coVat).toBe(true);
  });

  it('allows sender phone and address to remain visually empty on legacy APIs', () => {
    const payload = buildCreatePayload({
      ...emptyOrderForm(),
      dienThoaiKh: '',
      diaChiGui: '',
      nguoiGui: 'Tên người gửi',
    }, 0);

    expect(payload.sender_phone).toBeTruthy();
    expect(payload.sender_phone.trim()).toBe('');
    expect(payload.sender_address).toBeTruthy();
    expect(payload.sender_address.trim()).toBe('');
  });

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
    expect(payload.note).not.toContain('receiver_company_name=');
  });

  it('keeps an empty receiver name compatible with legacy APIs', () => {
    const payload = buildCreatePayload({
      ...emptyOrderForm(),
      nguoiNhan: '',
      dienThoaiNhan: '0938938112',
      diaChiNhan: 'Thủ Đức, Hồ Chí Minh',
    }, 0);

    expect(payload.receiver_name.trim()).toBe('');
  });

  it('keeps all empty receiver fields visually blank while remaining compatible with legacy APIs', () => {
    const payload = buildCreatePayload({
      ...emptyOrderForm(),
      nguoiNhan: '',
      dienThoaiNhan: '',
      diaChiNhan: '',
      huyen: '',
    }, 0);

    expect(payload.receiver_name.trim()).toBe('');
    expect(payload.receiver_phone.trim()).toBe('');
    expect(payload.receiver_address.trim()).toBe('');
    expect(payload.noi_den).toBeUndefined();
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

  it('restores the exact user note without exposing technical metadata', () => {
    const userNote = 'Giữ nguyên | mã=ABC\nDòng 2';
    const payload = buildCreatePayload({
      ...emptyOrderForm(),
      maKh: 'ABC',
      tenCongTyNhan: 'Công ty XYZ',
      ghiChu: userNote,
    }, 0);
    const form = waybillToOrderForm({
      id: '1',
      receiver_company_name: 'Công ty XYZ',
      note: payload.note,
    }, []);

    expect(form.ghiChu).toBe(userNote);
    expect(form.ghiChu).not.toContain('receiver_company_name=');
  });

  it('hides receiver company metadata from legacy bill notes', () => {
    const form = waybillToOrderForm({
      id: '1',
      note: 'receiver_company_name=Công ty cũ | Giao giờ hành chính',
    }, []);

    expect(form.tenCongTyNhan).toBe('Công ty cũ');
    expect(form.ghiChu).toBe('Giao giờ hành chính');
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

  it('normalizes a compact legacy province value for the province select', () => {
    const form = waybillToOrderForm({
      id: '60',
      note: 'tinh_den=BINHDUONG',
    }, []);

    expect(form.huyen).toBe('Bình Dương');
  });

  it('keeps destination HUB and receiver province in separate bill-list columns', () => {
    const item = waybillToBillItem({
      id: '61',
      waybill_code: 'ECOHAN61',
      dest_hub: { id: '2', code: 'HCM', name: 'Bưu cục Hồ Chí Minh' },
      noi_den: 'PHUYEN',
    });

    expect(item.destination).toBe('HCM');
    expect(item.destinationProvince).toBe('Phú Yên');
  });
});
