import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import InventoryStockListTemplate from './InventoryStockListTemplate';
import LoadPlanningPrintTemplate from './LoadPlanningPrintTemplate';
import { buildEmptyDispatchRow } from './dispatchPrintFormat';

describe('print image columns', () => {
  it('renders inventory image URLs as compact thumbnails', () => {
    const markup = renderToStaticMarkup(
      <InventoryStockListTemplate data={{
        printedAt: '03/09/2026',
        filterSummary: '',
        showPricing: false,
        columns: [{ id: 'bill_images', label: 'Hình ảnh' }],
        rows: [{ bill_images: 'https://example.com/one.jpg\nhttps://example.com/two.jpg' }],
        totals: {
          package_count: '0',
          weight_kg: '0',
          volumetric_weight_kg: '0',
          volume_m3: '0',
          total_amount: '',
          freight: '',
        },
      }} />,
    );

    expect(markup.match(/class="print-image-thumbnail"/g)).toHaveLength(2);
    expect(markup).not.toContain('<td class="col-inv-bill_images ">https://');
  });

  it('renders selected truck-list images as thumbnails', () => {
    const row = {
      ...buildEmptyDispatchRow(1),
      maBill: 'ECOHAN1',
      hinhAnh: 'https://example.com/truck.jpg',
    };
    const markup = renderToStaticMarkup(
      <LoadPlanningPrintTemplate data={{
        title: 'Bảng kê xe',
        printedAt: '03/09/2026',
        filterSummary: '',
        showPricing: false,
        visibleColumnIds: ['viTriHang', 'hinhAnh', 'maBill'],
        groups: [{
          truckLabel: '29H-12345',
          licensePlate: '29H-12345',
          nhaXe: '',
          manifestCode: '',
          rows: [row],
          totals: { soLuong: 0, tangHaThuKhach: 0, cuoc: 0, kg: 0, m3: 0 },
        }],
      }} />,
    );

    expect(markup).toContain('class="print-image-thumbnail"');
    expect(markup.indexOf('col-images')).toBeLessThan(markup.indexOf('col-bill'));
  });
});
