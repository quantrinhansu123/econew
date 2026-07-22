import { BadRequestException } from '@nestjs/common';
import {
  hasValidWaybillPhotos,
  isValidWaybillPhotoUrl,
  MAX_WAYBILL_PHOTOS,
  normalizeWaybillPhotos,
  parseWaybillPhotos,
} from './waybill-photos';

const storageOptions = {
  supabaseUrl: 'https://project.supabase.co',
  storageBucket: 'payment-proofs',
  allowLegacyExternalUrls: false,
};
const uploadedPhoto = 'https://project.supabase.co/storage/v1/object/public/payment-proofs/waybills/1770000000000-0123456789abcdef.jpg';

describe('waybill photos', () => {
  it('chuẩn hóa, loại URL trùng và giữ tối đa bốn ảnh', () => {
    expect(normalizeWaybillPhotos(' https://a.test/1.jpg |https://a.test/2.jpg\nhttps://a.test/1.jpg '))
      .toBe('https://a.test/1.jpg|https://a.test/2.jpg');
  });

  it('trả null khi giá trị không được cung cấp', () => {
    expect(normalizeWaybillPhotos(null)).toBeNull();
    expect(normalizeWaybillPhotos(undefined)).toBeNull();
    expect(parseWaybillPhotos(null)).toEqual([]);
  });

  it('chỉ chấp nhận URL mới đúng Supabase bucket và object format của upload endpoint', () => {
    expect(isValidWaybillPhotoUrl(uploadedPhoto, storageOptions)).toBe(true);
    expect(isValidWaybillPhotoUrl(
      'https://project.supabase.co/storage/v1/object/public/other/waybills/1770000000000-0123456789abcdef.jpg',
      storageOptions,
    )).toBe(false);
    expect(isValidWaybillPhotoUrl('https://example.com/photo.jpg', storageOptions)).toBe(false);
  });

  it.each(['pending-upload', '   ', 'blob:https://project.supabase.co/id', 'data:image/png;base64,AAAA'])(
    'từ chối giá trị ảnh giả %p',
    (value) => expect(() => normalizeWaybillPhotos(value, storageOptions)).toThrow(BadRequestException),
  );

  it('chỉ cho phép URL HTTPS có đuôi ảnh khi kiểm tra dữ liệu cũ', () => {
    expect(hasValidWaybillPhotos('https://legacy.example.com/proofs/photo.jpeg', {
      ...storageOptions,
      allowLegacyExternalUrls: true,
    })).toBe(true);
    expect(hasValidWaybillPhotos('http://legacy.example.com/proofs/photo.jpeg', {
      ...storageOptions,
      allowLegacyExternalUrls: true,
    })).toBe(false);
  });

  it('từ chối quá giới hạn ảnh', () => {
    const value = Array.from(
      { length: MAX_WAYBILL_PHOTOS + 1 },
      (_, index) => `https://a.test/${index}.jpg`,
    ).join('|');
    expect(() => normalizeWaybillPhotos(value)).toThrow(BadRequestException);
  });
});
