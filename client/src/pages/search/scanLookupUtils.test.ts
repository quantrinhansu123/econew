import { describe, expect, it } from 'vitest';
import { findExactManifestMatch, parseScannedLookupValue } from './scanLookupUtils';

describe('scanLookupUtils', () => {
  it('nhận QR URL của bảng kê và giữ đúng id', () => {
    expect(parseScannedLookupValue('http://127.0.0.1:6060/warehouse/manifests/51'))
      .toEqual({ kind: 'MANIFEST_ID', value: '51' });
  });

  it('nhận cả đường dẫn tương đối của bảng kê', () => {
    expect(parseScannedLookupValue('/warehouse/manifests/602?print=1'))
      .toEqual({ kind: 'MANIFEST_ID', value: '602' });
  });

  it('lấy mã vận đơn được nhúng trong QR nhưng không đoán sang mã khác', () => {
    expect(parseScannedLookupValue('https://eco.test/lookup?waybill_code=ECOHAN109157'))
      .toEqual({ kind: 'CODE', value: 'ECOHAN109157' });
  });

  it('chỉ chọn bảng kê khớp chính xác, không lấy kết quả gần giống', () => {
    const rows = [{ id: '1', manifest_code: 'BK-260811-5394' }, { id: '2', manifest_code: 'BK-260811-53940' }];
    expect(findExactManifestMatch(rows, 'bk-260811-5394')).toEqual(rows[0]);
    expect(findExactManifestMatch(rows, 'BK-260811-539')).toBeNull();
  });
});
