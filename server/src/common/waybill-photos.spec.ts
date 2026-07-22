import { BadRequestException } from '@nestjs/common';
import {
  MAX_WAYBILL_PHOTOS,
  normalizeWaybillPhotos,
  parseWaybillPhotos,
} from './waybill-photos';

describe('waybill photos', () => {
  it('chuẩn hóa, loại URL trùng và giữ tối đa bốn ảnh', () => {
    expect(normalizeWaybillPhotos(' https://a.test/1.jpg |https://a.test/2.jpg\nhttps://a.test/1.jpg '))
      .toBe('https://a.test/1.jpg|https://a.test/2.jpg');
  });

  it('trả null khi không có ảnh', () => {
    expect(normalizeWaybillPhotos('  ')).toBeNull();
    expect(parseWaybillPhotos(null)).toEqual([]);
  });

  it('từ chối quá giới hạn ảnh', () => {
    const value = Array.from(
      { length: MAX_WAYBILL_PHOTOS + 1 },
      (_, index) => `https://a.test/${index}.jpg`,
    ).join('|');
    expect(() => normalizeWaybillPhotos(value)).toThrow(BadRequestException);
  });
});
