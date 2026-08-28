import { describe, expect, it } from 'vitest';
import { formatDateKey, formatExpiryMessage, getTruckExpiryInfo } from './truckCompliance';

describe('truckCompliance', () => {
  it('cảnh báo giấy tờ hết hạn trong đúng 15 ngày', () => {
    expect(getTruckExpiryInfo('2026-09-12', '2026-08-28')).toMatchObject({ daysRemaining: 15, state: 'DUE_SOON' });
    expect(getTruckExpiryInfo('2026-09-13', '2026-08-28')).toMatchObject({ daysRemaining: 16, state: 'VALID' });
  });

  it('phân biệt quá hạn, hết hạn hôm nay và trường không bắt buộc', () => {
    expect(getTruckExpiryInfo('2026-08-27', '2026-08-28').state).toBe('EXPIRED');
    expect(formatExpiryMessage(getTruckExpiryInfo('2026-08-28', '2026-08-28'))).toBe('Hết hạn hôm nay');
    expect(getTruckExpiryInfo(null, '2026-08-28').state).toBe('MISSING');
  });

  it('định dạng ngày Việt Nam mà không lệch múi giờ', () => {
    expect(formatDateKey('2027-01-05')).toBe('05/01/2027');
  });
});
