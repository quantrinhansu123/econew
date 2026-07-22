import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WaybillDetail } from '../warehouse/orders/types';
import {
  buildWaybillPrintData,
  fitWaybillInvoiceElement,
  normalizeWaybillPrintCode,
  printWaybillWhenReady,
} from './waybillPrintUtils';
import { canViewWaybillPricing, shouldShowWaybillPricing } from './waybillPricingAccess';
import {
  buildWaybillPageSizeRule,
  resolveWaybillPrintFormat,
  withWaybillPrintFormat,
  type WaybillPrintFormat,
} from './waybillPrintFormat';

describe('waybill print format', () => {
  it('keeps legacy URLs on the A4 portrait default', () => {
    expect(resolveWaybillPrintFormat(null)).toBe('a4');
    expect(resolveWaybillPrintFormat('a4')).toBe('a4');
    expect(resolveWaybillPrintFormat('unknown')).toBe('a4');
  });

  it('recognizes A5 landscape and the explicit A4 landscape mode', () => {
    expect(resolveWaybillPrintFormat('a5')).toBe('a5');
    expect(resolveWaybillPrintFormat('a4-landscape')).toBe('a4-landscape');
  });

  it.each<[WaybillPrintFormat, string]>([
    ['a4', 'A4 portrait'],
    ['a4-landscape', 'A4 landscape'],
    ['a5', 'A5 landscape'],
  ])('builds a zero-margin one-sheet page rule for %s', (format, pageSize) => {
    expect(buildWaybillPageSizeRule(format)).toBe(
      `@media print { @page { size: ${pageSize}; margin: 0; } }`,
    );
  });

  it('preserves other query values and omits the legacy default format', () => {
    const original = new URLSearchParams('ids=1%2C2&print=1&pricing=show&format=a5');
    const landscape = withWaybillPrintFormat(original, 'a4-landscape');
    const legacyDefault = withWaybillPrintFormat(landscape, 'a4');

    expect(landscape.get('format')).toBe('a4-landscape');
    expect(landscape.get('ids')).toBe('1,2');
    expect(landscape.get('pricing')).toBe('show');
    expect(legacyDefault.has('format')).toBe(false);
    expect(original.get('format')).toBe('a5');
  });
});

describe('waybill print code', () => {
  it('removes visible and invisible separators without changing the code characters', () => {
    expect(normalizeWaybillPrintCode(' ECO-HAN 001\n234 ')).toBe('ECOHAN001234');
    expect(normalizeWaybillPrintCode('ECO\u2011HAN\u200B009')).toBe('ECOHAN009');
  });
});

describe('waybill print pricing access', () => {
  it('allows only manager/director role bits and requires an explicit show request', () => {
    expect(canViewWaybillPricing(32)).toBe(true);
    expect(canViewWaybillPricing(64)).toBe(true);
    expect(canViewWaybillPricing(32 | 64)).toBe(true);
    expect(canViewWaybillPricing(31)).toBe(false);
    expect(shouldShowWaybillPricing(32, null)).toBe(false);
    expect(shouldShowWaybillPricing(32, 'hide')).toBe(false);
    expect(shouldShowWaybillPricing(16, 'show')).toBe(false);
    expect(shouldShowWaybillPricing(64, 'show')).toBe(true);
  });

  it('keeps freight blank by default and formats it only when authorized upstream', () => {
    const waybill: WaybillDetail = {
      id: '1',
      waybill_code: 'ECO-HAN-001',
      cost_amount: 125_000,
    };

    const hidden = buildWaybillPrintData(waybill);
    const visible = buildWaybillPrintData(waybill, true);

    expect(hidden.showPricing).toBe(false);
    expect(hidden.cuocChinh).toBe('');
    expect(hidden.tongCuoc).toBe('');
    expect(visible.showPricing).toBe(true);
    expect(visible.cuocChinh).toBe('125.000 đ');
    expect(visible.tongCuoc).toBe('125.000 đ');
  });
});

describe('printWaybillWhenReady', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('waits through two animation frames before opening the print dialog', async () => {
    const print = vi.fn();
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    vi.stubGlobal('document', { querySelectorAll: () => [] });
    vi.stubGlobal('window', {
      print,
      requestAnimationFrame,
      setTimeout: vi.fn(() => 1),
    });

    await printWaybillWhenReady();

    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    expect(print).toHaveBeenCalledOnce();
  });
});

describe('fitWaybillInvoiceElement', () => {
  it('keeps normal content at 100%', () => {
    const setProperty = vi.fn();
    const invoice = {
      closest: () => ({ clientWidth: 1_000, clientHeight: 680 }),
      scrollWidth: 1_000,
      offsetWidth: 1_000,
      scrollHeight: 680,
      offsetHeight: 680,
      style: { setProperty },
    } as unknown as HTMLElement;

    expect(fitWaybillInvoiceElement(invoice)).toBe(1);
    expect(setProperty).toHaveBeenLastCalledWith('--eco-fit-scale', '1.0000');
  });

  it('shrinks long content enough to fit the fixed frame without clipping', () => {
    const setProperty = vi.fn();
    const invoice = {
      closest: () => ({ clientWidth: 1_000, clientHeight: 680 }),
      scrollWidth: 1_000,
      offsetWidth: 1_000,
      scrollHeight: 850,
      offsetHeight: 850,
      style: { setProperty },
    } as unknown as HTMLElement;

    expect(fitWaybillInvoiceElement(invoice)).toBeCloseTo(0.8);
    expect(setProperty).toHaveBeenLastCalledWith('--eco-fit-scale', '0.8000');
  });
});
