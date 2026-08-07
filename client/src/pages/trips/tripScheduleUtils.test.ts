import { describe, expect, it } from 'vitest';
import { toLocalDateTimeInput } from './tripScheduleUtils';

describe('toLocalDateTimeInput', () => {
  it('giữ đúng thời điểm khi đổi sang input datetime-local', () => {
    const source = '2026-08-07T08:30:00.000Z';
    const localValue = toLocalDateTimeInput(source);
    expect(new Date(localValue).toISOString()).toBe(source);
  });

  it('trả rỗng với ngày không hợp lệ', () => {
    expect(toLocalDateTimeInput('khong-phai-ngay')).toBe('');
    expect(toLocalDateTimeInput(null)).toBe('');
  });
});
