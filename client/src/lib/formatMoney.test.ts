import { describe, expect, it } from 'vitest';
import { formatAmountInputFromNumber, parseAmountInput } from './formatMoney';

describe('money input formatting', () => {
  it('does not treat decimal database scale as extra digits', () => {
    expect(formatAmountInputFromNumber('5130000.00')).toBe('5.130.000');
    expect(parseAmountInput(formatAmountInputFromNumber('1370000.00'))).toBe(1_370_000);
  });
});
