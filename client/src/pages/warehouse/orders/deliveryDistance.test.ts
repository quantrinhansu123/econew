import { describe, expect, it } from 'vitest';
import { buildDeliveryAddress, isDistanceBlocked, mergeDistanceUsage, validDeliveryCoordinates, type DeliveryDistanceUsage } from './deliveryDistance';

const usage = (): DeliveryDistanceUsage => ({
  provider: 'HERE', configured: true, month: '2026-10', observed_at: '2026-10-18T02:00:00.000Z',
  directions: { used: 1, limit: 30000, free_limit: 30000, remaining: 29999, resets_at: '2026-11-01T00:00:00Z', minute_used: 1, minute_limit: 60, minute_remaining: 59, minute_resets_at: null, blocked_until: null, blocked: false },
  geocoding: { used: 1, limit: 30000, free_limit: 30000, remaining: 29999, resets_at: '2026-11-01T00:00:00Z', minute_used: 1, minute_limit: 60, minute_remaining: 59, minute_resets_at: null, blocked_until: null, blocked: false },
});

describe('delivery distance address', () => {
  it('includes street, ward, district and province', () => {
    expect(buildDeliveryAddress({ diaChiNhan: ' 123 Nguyễn Huệ ', phuongXa: 'Bến Nghé', quanHuyen: 'Quận 1', huyen: 'TP HCM' })).toBe('123 Nguyễn Huệ, Bến Nghé, Quận 1, TP HCM, Việt Nam');
  });
  it('does not duplicate address components already present in a full address', () => {
    expect(buildDeliveryAddress({ diaChiNhan: '123 Nguyễn Huệ, Quận 1, TP HCM, Việt Nam', phuongXa: '', quanHuyen: 'Quận 1', huyen: 'TP HCM' })).toBe('123 Nguyễn Huệ, Quận 1, TP HCM, Việt Nam');
  });
  it('uses separately entered ward and province for the reported address', () => {
    expect(buildDeliveryAddress({ diaChiNhan: '26 Trần Hải Phụng', phuongXa: 'Tân Tạo', quanHuyen: '', huyen: 'Hồ Chí Minh' }))
      .toBe('26 Trần Hải Phụng, Tân Tạo, Hồ Chí Minh, Việt Nam');
  });
  it('keeps a ward that shares its name with the street', () => {
    expect(buildDeliveryAddress({ diaChiNhan: '26 Đường Tân Tạo', phuongXa: 'Tân Tạo', quanHuyen: 'Bình Tân', huyen: 'Hồ Chí Minh' }))
      .toBe('26 Đường Tân Tạo, Tân Tạo, Bình Tân, Hồ Chí Minh, Việt Nam');
  });
  it('does not confuse a district with a substring of a different district', () => {
    expect(buildDeliveryAddress({ diaChiNhan: '26 Nguyễn Huệ, Quận 11', phuongXa: '', quanHuyen: 'Quận 1', huyen: '' }))
      .toBe('26 Nguyễn Huệ, Quận 11, Quận 1, Việt Nam');
  });
  it('recognizes administrative prefixes in a full address with dashes', () => {
    expect(buildDeliveryAddress({ diaChiNhan: '26 Trần Hải Phụng - Phường Tân Tạo - TP. Hồ Chí Minh', phuongXa: 'Tân Tạo', quanHuyen: '', huyen: 'Hồ Chí Minh' }))
      .toBe('26 Trần Hải Phụng - Phường Tân Tạo - TP. Hồ Chí Minh, Việt Nam');
  });
  it('keeps wards and districts with matching names or numbers at different levels', () => {
    expect(buildDeliveryAddress({ diaChiNhan: '26 Nguyễn Huệ, Phường 1', phuongXa: 'Phường 1', quanHuyen: 'Quận 1', huyen: 'Hồ Chí Minh' }))
      .toBe('26 Nguyễn Huệ, Phường 1, Quận 1, Hồ Chí Minh, Việt Nam');
    expect(buildDeliveryAddress({ diaChiNhan: '26 Nguyễn Huệ', phuongXa: 'Tân Phú', quanHuyen: 'Tân Phú', huyen: 'Hồ Chí Minh' }))
      .toBe('26 Nguyễn Huệ, Tân Phú, Tân Phú, Hồ Chí Minh, Việt Nam');
  });
  it('does not duplicate a province whose name contains a dash', () => {
    expect(buildDeliveryAddress({ diaChiNhan: '1 Trần Hưng Đạo, Bà Rịa - Vũng Tàu', phuongXa: '', quanHuyen: '', huyen: 'Bà Rịa - Vũng Tàu' }))
      .toBe('1 Trần Hưng Đạo, Bà Rịa - Vũng Tàu, Việt Nam');
  });
  it.each(['10.779971,106.700052', ' 10.7, 106.6 ', '0,0'])('accepts latitude,longitude: %s', value => {
    expect(validDeliveryCoordinates(value)).toBe(true);
  });
  it.each(['106.7,10.7', '10.7,181', 'hello', '', '10.7'])('rejects malformed or reversed Vietnam coordinates: %s', value => {
    expect(validDeliveryCoordinates(value)).toBe(false);
  });
});

describe('HERE usage', () => {
  it('ignores an older counter snapshot arriving after a newer one', () => {
    const current = usage();
    const old = { ...usage(), observed_at: '2026-10-18T01:00:00.000Z' };
    expect(mergeDistanceUsage(current, old)).toEqual(current);
  });
  it('accepts a monthly reset from a newer server snapshot', () => {
    const current = usage();
    current.directions = { ...current.directions, used: 30000, remaining: 0, blocked: true };
    const next = { ...usage(), month: '2026-11', observed_at: '2026-11-01T00:00:00.000Z' };
    expect(mergeDistanceUsage(current, next)).toEqual(next);
  });
  it('allows coordinate routes when only Geocoding quota is exhausted', () => {
    const current = usage();
    current.geocoding.blocked = true;
    expect(isDistanceBlocked(current, true)).toBe(true);
    expect(isDistanceBlocked(current, false)).toBe(false);
  });
  it('always blocks exhausted Directions, missing config or unknown counters', () => {
    const current = usage();
    current.directions.blocked = true;
    expect(isDistanceBlocked(current, false)).toBe(true);
    expect(isDistanceBlocked({ ...usage(), configured: false }, false)).toBe(true);
    expect(isDistanceBlocked(null, false)).toBe(true);
  });

  it('fails closed for counts that exceed the cap even if the server blocked flag is missing', () => {
    const current = usage();
    current.directions.used = 30000;
    expect(isDistanceBlocked(current, false)).toBe(true);
    current.directions = { ...usage().directions, limit: 60000 };
    expect(isDistanceBlocked(current, false)).toBe(true);
  });
});
