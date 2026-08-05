import { describe, expect, it } from 'vitest';
import {
  normalizeWaybillSpecialGoods,
  resolveWaybillDisplayNote,
  specialGoodsFromWaybillNote,
} from './waybillSpecialGoods';

describe('waybill special goods', () => {
  it('normalizes known values and removes duplicates', () => {
    expect(normalizeWaybillSpecialGoods('HIGH_VALUE,FRAGILE,HIGH_VALUE,UNKNOWN')).toEqual([
      'HIGH_VALUE',
      'FRAGILE',
    ]);
  });

  it('reads selected properties from note metadata', () => {
    expect(specialGoodsFromWaybillNote('ma_kh=A | special_goods=OVERSIZED,LIQUID')).toEqual([
      'OVERSIZED',
      'LIQUID',
    ]);
  });

  it('combines the user note and readable special goods labels', () => {
    const note = `user_note=${encodeURIComponent('Gọi trước khi giao')} | special_goods=RETURN_DOCUMENTS,MAGNETIC_BATTERY`;
    expect(resolveWaybillDisplayNote(note)).toBe(
      'Gọi trước khi giao · Hoàn chứng từ gốc đi kèm, Từ tính, Pin',
    );
  });
});
