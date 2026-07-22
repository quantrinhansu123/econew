import { describe, expect, it } from 'vitest';
import { compactWaybillCode, findExactWaybillMatch } from './searchWaybillUtils';

describe('waybill scan matching', () => {
  const rows = [
    { id: '1', waybill_code: 'ECO-HAN-108962' },
    { id: '2', waybill_code: 'ECOHCM108963' },
  ];

  it('normalizes spaces, dashes and letter casing from barcode scanners', () => {
    expect(compactWaybillCode(' eco-han 108962 ')).toBe('ECOHAN108962');
  });

  it('opens only the exact scanned bill even when its stored code has dashes', () => {
    expect(findExactWaybillMatch(rows, 'ECOHAN108962')?.id).toBe('1');
    expect(findExactWaybillMatch(rows, 'ECOHAN1089')).toBeNull();
  });
});
