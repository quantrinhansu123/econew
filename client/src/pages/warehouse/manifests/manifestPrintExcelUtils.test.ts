import { describe, expect, it } from 'vitest';
import { read, write, type CellObject } from 'xlsx';
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
    expect(worksheet['!rows']?.map((row) => row.hpt)).toEqual([28, 60, 60, 34, 38, 24, 26]);
    expect((worksheet.A1 as CellObject).s?.font).toMatchObject({ name: 'Times New Roman', sz: 16, bold: true });
    expect((worksheet.A2 as CellObject).s?.font).toMatchObject({ name: 'Times New Roman', sz: 10 });
    expect((worksheet.A4 as CellObject).s?.font).toMatchObject({ name: 'Arial', sz: 9, bold: true });
    expect(worksheet['!margins']).toEqual({ left: 0.2, right: 0.2, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 });
    expect(worksheet['!pageSetup']).toMatchObject({ orientation: 'landscape', fitToWidth: 1, fitToHeight: 0, paperSize: 9 });

    const exported = write(workbook!, { type: 'buffer', bookType: 'xlsx' });
    expect(exported.byteLength).toBeGreaterThan(1_000);
    const reopened = read(exported, { type: 'buffer' });
    expect(reopened.Sheets['Bang ke phat hang'].A1.v).toBe('BẢNG KÊ PHÁT HÀNG ECO');
    expect(reopened.Sheets['Bang ke phat hang'].A2.v).toContain('Bưu cục Hà Nội');
  });
});
