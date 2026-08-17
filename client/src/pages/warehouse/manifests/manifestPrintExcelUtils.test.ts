import { describe, expect, it } from 'vitest';
import type { CellObject } from 'xlsx';
import {
  buildManifestPrintRows,
  groupManifestPrintLinksByDestination,
  normalizeManifestPrintLinks,
} from './manifestDispatchPrintUtils';
import { buildManifestPrintExcelWorkbook } from './manifestPrintExcelUtils';
import type { LoadPlanningManifest } from './types';

describe('manifest print Excel workbook', () => {
  it('matches the printable section layout and keeps COD as a formatted number', () => {
    const manifest: LoadPlanningManifest = {
      id: 69,
      manifest_code: 'BK-260817-3709',
      origin_hub_id: 1,
      origin_hub: { id: 1, code: 'HAN', name: 'Bưu cục Hà Nội', phone: '0966 692 422' },
      dest_hub_id: 2,
      dest_hub: { id: 2, code: 'HCM', name: 'Bưu cục Hồ Chí Minh', phone: '0964 462 922' },
      trip: {
        id: 79,
        status: 'IN_TRANSIT',
        manual_license_plate: '29E-093.07',
        driver_name: 'Nguyễn Văn A',
        driver_phone: '0909000000',
      },
      manifest_waybills: [{
        waybill_id: 10,
        loading_position: 1,
        dispatch_fields: { ten_cty: 'A Nam bài tập', cod: '10072500', ma_bill: 'ECOHAN109279' },
        waybill: {
          id: 10,
          waybill_code: 'ECOHAN109279',
          package_count: 36,
          cod_amount: 10072500,
          dest_hub_id: 2,
          dest_hub: { id: 2, code: 'HCM', name: 'Bưu cục Hồ Chí Minh' },
        },
      }],
    };
    const links = normalizeManifestPrintLinks(manifest);
    const groups = groupManifestPrintLinksByDestination(manifest, links);
    const rows = buildManifestPrintRows(links);

    const workbook = buildManifestPrintExcelWorkbook(
      manifest,
      groups,
      rows,
      ['viTriHang', 'tenCtv', 'tangHaThuKhach', 'maBill'],
    );

    expect(workbook).not.toBeNull();
    const worksheet = workbook!.Sheets['Bang ke phat hang'];
    expect(worksheet.A1.v).toBe('BẢNG KÊ PHÁT HÀNG ECO');
    expect(worksheet.C4.v).toBe('COD');
    expect(worksheet.C5.v).toBe(10072500);
    expect((worksheet.C5 as CellObject).s?.numFmt).toBe('#,##0');
    expect(worksheet.C6.v).toBe(10072500);
    expect(worksheet['!merges']).toContainEqual({ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } });
    expect(worksheet['!merges']).toContainEqual({ s: { r: 6, c: 0 }, e: { r: 6, c: 3 } });
  });
});
