import { describe, expect, it } from 'vitest';
import { extractProvinceFromAddress } from './vietnamProvince';

describe('extractProvinceFromAddress', () => {
  it('extracts a known province without an administrative prefix', () => {
    expect(extractProvinceFromAddress('12 Lê Hồng Phong, Nha Trang, Khánh Hòa')).toBe('Khánh Hòa');
  });

  it('normalizes a prefixed province-level city', () => {
    expect(extractProvinceFromAddress('215 Nguyễn Trãi, Q.1, TP.HCM')).toBe('HCM');
  });

  it('does not mistake an unprefixed ward for a province', () => {
    expect(extractProvinceFromAddress('165 Thạch Xuân, Thới An')).toBe('');
  });

  it('does not mistake a district-level city for a province', () => {
    expect(extractProvinceFromAddress('12 Võ Văn Ngân, TP. Thủ Đức')).toBe('');
  });
});
