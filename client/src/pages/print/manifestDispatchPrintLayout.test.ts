import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./inventory-stock-list.css', import.meta.url), 'utf8');
const printView = readFileSync(new URL('../warehouse/manifests/ManifestDispatchPrintView.tsx', import.meta.url), 'utf8');
const tripCard = readFileSync(new URL('../trips/TripKanbanCard.tsx', import.meta.url), 'utf8');

describe('compact manifest and trip layouts', () => {
  it('keeps manifest metadata on one four-column row without a duplicate manifest-code card', () => {
    expect(printView).not.toContain('>Mã bảng kê</span>');
    expect(printView).toContain('dòng hàng · Quét mở bảng kê');
    expect(css).toMatch(/\.manifest-dispatch-print-meta-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s);
    expect(css).toMatch(/\.manifest-dispatch-print-qr\s*\{[^}]*width:\s*12mm;[^}]*height:\s*12mm;/s);
  });

  it('uses compact Arial typography and removes the printed row minimum height', () => {
    expect(css).toMatch(/\.manifest-dispatch-sheet-table\s*\{[^}]*font-family:\s*Arial,/s);
    expect(css).toMatch(/@media print[\s\S]*\.manifest-dispatch-sheet-table tbody td > div\s*\{[^}]*min-height:\s*0 !important;/s);
    expect(css).toMatch(/@media print[\s\S]*\.manifest-dispatch-sheet-table tbody td > div\s*\{[^}]*font-size:\s*5\.8pt !important;/s);
  });

  it('keeps hub, driver and phone metadata readable on screen and paper', () => {
    expect(css).toMatch(/\.manifest-dispatch-print-meta-detail\s*\{[^}]*font-size:\s*9pt;/s);
    expect(css).toMatch(/\.manifest-dispatch-phone\s*\{[^}]*font-size:\s*10pt;[^}]*font-weight:\s*900;/s);
    expect(css).toMatch(/\.manifest-dispatch-sheet-table tfoot tr:last-child td\s*\{[^}]*font-size:\s*9\.5pt;/s);
    expect(printView.match(/manifest-dispatch-phone/g)).toHaveLength(3);
  });

  it('keeps trip information in three compact two-column rows', () => {
    expect(tripCard).toContain('<CompactCell label="Tuyến" value={routeLabel(trip)} />');
    expect(tripCard).not.toContain('label="Tuyến" value={routeLabel(trip)} className="col-span-2"');
    expect(tripCard).toContain("'inline-flex h-6 w-6 items-center");
  });
});
