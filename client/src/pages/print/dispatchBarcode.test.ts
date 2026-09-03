import { describe, expect, it } from 'vitest';
import { buildDispatchBarcodeUrl, buildManifestScanPath, buildManifestScanUrl, buildQrCodeUrl } from './dispatchBarcode';
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

  it('offers images and preserves the dragged print-column order', () => {
    expect(getSelectableDispatchColumns(true).map((column) => column.id)).toContain('hinhAnh');
    expect(getDefaultVisibleDispatchColumnIds(true)).not.toContain('hinhAnh');
    expect(resolveVisibleDispatchColumnIds(['viTriHang', 'hinhAnh', 'maBill', 'soLuong'], true)).toEqual([
      'viTriHang',
      'hinhAnh',
      'maBill',
      'soLuong',
    ]);
  });

  it('builds an encoded Code 128 image URL from the bill code', () => {
    const url = buildDispatchBarcodeUrl('ECO HAN/109178');

    expect(url).toContain('bcid=code128');
    expect(url).toContain('text=ECO%20HAN%2F109178');
    expect(buildDispatchBarcodeUrl('  ')).toBe('');
  });

  it('builds a unique manifest QR that opens the exact manifest detail route', () => {
    expect(buildManifestScanPath(109)).toBe('/warehouse/manifests/109');
    expect(buildManifestScanUrl(109, 'http://localhost:6060/')).toBe('http://localhost:6060/warehouse/manifests/109');
    expect(buildQrCodeUrl(buildManifestScanUrl(109, 'http://localhost:6060'))).toContain(
      encodeURIComponent('http://localhost:6060/warehouse/manifests/109'),
    );
  });
});
