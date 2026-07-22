/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./waybill-invoice.css', import.meta.url), 'utf8');

describe('waybill print CSS contract', () => {
  it('keeps a 5mm safe area and the original compact Arial template', () => {
    expect(css).toMatch(/\.waybill-paper-preview\s*\{[^}]*padding:\s*5mm;/s);
    expect(css).toMatch(/\.waybill-invoice\s*\{[^}]*font-family:\s*Arial, Helvetica, sans-serif;/s);
    expect(css).toMatch(/\.waybill-invoice\s*\{[^}]*--eco-a5-scale:\s*0\.64;/s);
  });

  it('fits the scaled slip inside exactly one A4 landscape sheet', () => {
    expect(css).toMatch(
      /\.waybill-paper-preview--a4-landscape\s*\{[^}]*width:\s*297mm;[^}]*height:\s*210mm;/s,
    );
    expect(css).toMatch(
      /\.waybill-paper-preview--a4-landscape\s*>\s*\.waybill-invoice-frame\s*\{[^}]*transform:\s*scale\(1\.435\);/s,
    );
    expect(css).toMatch(/\.waybill-paper-preview\s*\{[^}]*break-inside:\s*avoid\s*!important;/s);
  });

  it('keeps long content measurable and scales it inside a fixed one-page frame', () => {
    expect(css).toMatch(/\.waybill-invoice-frame\s*\{[^}]*width:\s*200mm;[^}]*height:\s*136mm;[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/\.waybill-invoice\s*\{[^}]*--eco-fit-scale:\s*1;[^}]*overflow:\s*visible;[^}]*transform:\s*scale\(var\(--eco-fit-scale\)\);/s);
    expect(css).not.toMatch(/-webkit-line-clamp/);
    expect(css).not.toMatch(/text-overflow:\s*ellipsis/);
  });

  it('forces one bulk waybill per page without a trailing blank page', () => {
    expect(css).toMatch(/\.waybill-bulk-print-item\s*\{[^}]*break-after:\s*page;/s);
    expect(css).toMatch(/\.waybill-bulk-print-item:last-child\s*\{[^}]*break-after:\s*auto;/s);
  });
});
