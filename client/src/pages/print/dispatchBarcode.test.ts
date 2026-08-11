import { describe, expect, it } from 'vitest';
import { buildDispatchBarcodeUrl } from './dispatchBarcode';
import {
  getDefaultVisibleDispatchColumnIds,
  getSelectableDispatchColumns,
  resolveVisibleDispatchColumnIds,
} from './dispatchPrintColumns';

describe('dispatch bill barcode column', () => {
  it('offers a selectable barcode column without forcing it into existing print layouts', () => {
    expect(getSelectableDispatchColumns(true).map((column) => column.id)).toContain('maVach');
    expect(getDefaultVisibleDispatchColumnIds(true)).not.toContain('maVach');
    expect(resolveVisibleDispatchColumnIds(['viTriHang', 'maVach'], true)).toContain('maVach');
  });

  it('builds an encoded Code 128 image URL from the bill code', () => {
    const url = buildDispatchBarcodeUrl('ECO HAN/109178');

    expect(url).toContain('bcid=code128');
    expect(url).toContain('text=ECO%20HAN%2F109178');
    expect(buildDispatchBarcodeUrl('  ')).toBe('');
  });
});
