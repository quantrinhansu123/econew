import { describe, expect, it } from 'vitest';
import { settlementToday } from './settlementTypes';

describe('vendor payment calendar date', () => {
  it('uses the Vietnam day across midnight and month boundaries', () => {
    expect(settlementToday(new Date('2026-08-31T16:59:59Z'))).toBe('2026-08-31');
    expect(settlementToday(new Date('2026-08-31T17:00:00Z'))).toBe('2026-09-01');
  });
});
