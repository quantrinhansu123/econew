import { describe, expect, it } from 'vitest';
import { billMatchesDate, sortBillsByBillDate } from '../billListDate';
import type { BillListItem } from '../orderFormTypes';

const bill = (id: string, date: string, createdAt: string): BillListItem => ({
  id,
  date,
  createdAt,
  waybill_code: id,
  package_count: 1,
  destination: 'HCM',
  destinationProvince: 'Hồ Chí Minh',
  senderName: '',
  customerCode: '',
  collectOnDelivery: 0,
});

describe('bill list date grouping', () => {
  it('groups by date on the bill even when creation timestamps interleave', () => {
    const sorted = sortBillsByBillDate([
      bill('A', '26/09/2026', '2026-09-27T10:00:00Z'),
      bill('B', '25/09/2026', '2026-09-27T09:00:00Z'),
      bill('C', '26/09/2026', '2026-09-26T08:00:00Z'),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['A', 'C', 'B']);
    expect(billMatchesDate(sorted[0], '2026-09-26')).toBe(true);
    expect(billMatchesDate(sorted[0], '2026-09-27')).toBe(false);
  });
});
