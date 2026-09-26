import { describe, expect, it } from 'vitest';
import { calculateDimensionRow, calculateDimensionTotals, type DimensionRow } from './waybillDimensionUtils';

const row = (values: Partial<DimensionRow> = {}): DimensionRow => ({
  id: '1', quantity: '2', lengthCm: '100', widthCm: '50', heightCm: '40', ...values,
});

describe('waybill dimension calculations', () => {
  it('calculates CBM and converted weight with divisor 3000', () => {
    expect(calculateDimensionRow(row())).toMatchObject({ volumeM3: 0.4, convertedWeightKg: 133.33 });
  });

  it('accepts Vietnamese decimal commas and sums all rows', () => {
    const totals = calculateDimensionTotals([row(), row({ id: '2', quantity: '1', lengthCm: '50,5', widthCm: '20', heightCm: '10' })]);
    expect(totals.packageCount).toBe(3);
    expect(totals.volumeM3).toBe(0.41);
    expect(totals.convertedWeightKg).toBe(136.7);
  });

  it('rounds CBM up to 2 decimal places (e.g. 41.1264 -> 41.13)', () => {
    const testRow: DimensionRow = {
      id: 'test-1',
      quantity: '42',
      lengthCm: '96',
      widthCm: '85',
      heightCm: '120',
    };
    const rowResult = calculateDimensionRow(testRow);
    expect(rowResult.volumeM3).toBe(41.13);
    expect(rowResult.convertedWeightKg).toBe(13708.8);

    const totals = calculateDimensionTotals([testRow]);
    expect(totals.volumeM3).toBe(41.13);
    expect(totals.convertedWeightKg).toBe(13708.8);
  });

  it('treats incomplete or invalid cells as zero', () => {
    expect(calculateDimensionRow(row({ widthCm: '' })).convertedWeightKg).toBe(0);
  });
});
