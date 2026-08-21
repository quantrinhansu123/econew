/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./waybill-invoice.css', import.meta.url), 'utf8');
const singlePrintPage = readFileSync(new URL('./PrintWaybillPage.tsx', import.meta.url), 'utf8');
const bulkPrintPage = readFileSync(new URL('./PrintWaybillsBulkPage.tsx', import.meta.url), 'utf8');

describe('waybill invoice marked layout', () => {
  it('removes only the outer frame and keeps explicit receiver/sender grid placement', () => {
    expect(css).toMatch(/\.waybill-invoice\s*\{[^}]*border:\s*0;/s);
    expect(css).toMatch(/\.eco-band--receiver-summary\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/s);
    expect(css).toMatch(/\.eco-recipient-summary\s*\{[^}]*display:\s*block;/s);
    expect(css).toMatch(/\.eco-band--sender-contact\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*4;/s);
    expect(css).toMatch(/\.eco-band--receiver-contact\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*4;/s);
    expect(css).toMatch(/\.eco-phone-numbers\s*\{[^}]*display:\s*inline;/s);
  });

  it('uses Arial throughout and fixes the marked cells to matching grid tracks', () => {
    expect(css).toMatch(
      /\.waybill-invoice,\s*\.waybill-invoice \*\s*\{[^}]*font-family:\s*Arial,\s*sans-serif\s*!important;/s,
    );
    expect(css).toMatch(/\.eco-a5-header\s*\{[^}]*position:\s*relative;[^}]*display:\s*block;/s);
    expect(css).toMatch(/\.eco-a5-header \.eco-a5-brand\s*\{[^}]*width:\s*60mm;[^}]*position:\s*absolute;[^}]*inset:\s*0 auto 0 0;/s);
    expect(css).toMatch(/\.eco-a5-header \.eco-a5-title\s*\{[^}]*width:\s*85mm;[^}]*position:\s*absolute;[^}]*inset:\s*0 auto 0 30mm;/s);
    expect(css).toMatch(/\.eco-a5-header \.eco-a5-barcode\s*\{[^}]*width:\s*90mm;[^}]*position:\s*absolute;[^}]*inset:\s*0 0 0 auto;/s);
    expect(css).toMatch(/\.eco-a5-template \.eco-logo\s*\{[^}]*position:\s*absolute;[^}]*left:\s*-1mm;[^}]*object-position:\s*left center;/s);
    expect(css).toMatch(/\.eco-a5-template \.eco-phone\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*0\.5mm;[^}]*left:\s*0;/s);
    expect(css).toMatch(/--fs-subtitle:\s*calc\(17pt \* var\(--eco-a5-scale\)\);/s);
    expect(css).toMatch(/\.eco-a5-title h2\s*\{[^}]*white-space:\s*nowrap;/s);
    expect(css).toMatch(
      /\.eco-a5-left-panel\s*\{[^}]*grid-template-rows:\s*12mm 8mm minmax\(0,\s*1fr\);/s,
    );
    expect(css).toMatch(
      /\.eco-note-cell\s*\{[^}]*padding:\s*0;[^}]*grid-template-rows:\s*6\.2mm minmax\(0,\s*1fr\);/s,
    );
    expect(css).toMatch(
      /\.eco-charge-box\s*\{[^}]*grid-template-rows:\s*12mm minmax\(0,\s*1fr\);/s,
    );
    expect(css).toMatch(
      /\.eco-charge-line\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) max-content;/s,
    );
    expect(css).toMatch(
      /\.eco-charge-lines\s*\{[^}]*font-size:\s*var\(--fs-sm\);/s,
    );
    expect(css).toMatch(
      /\.eco-charge-line > :first-child\s*\{[^}]*white-space:\s*nowrap;/s,
    );
    expect(css).toMatch(
      /\.eco-charge-value\s*\{[^}]*min-width:\s*max-content;[^}]*white-space:\s*nowrap;/s,
    );
    expect(css).toMatch(
      /\.eco-a5-template \.eco-total-value\s*\{[^}]*white-space:\s*nowrap;/s,
    );
    expect(css).toMatch(
      /\.eco-extra-info-box b\s*\{[^}]*min-width:\s*max-content;[^}]*white-space:\s*nowrap;/s,
    );
    expect(css).toMatch(/\.eco-extra-info-box--cod\s*\{[^}]*grid-row:\s*2;/s);
    expect(css).toMatch(/\.eco-extra-info-box--declared-value\s*\{[^}]*grid-row:\s*3;/s);
    expect(css).toMatch(
      /\.eco-sign-box\s*\{[^}]*grid-template-rows:\s*6mm minmax\(0,\s*1fr\);/s,
    );
    const totalRule = css.match(/\.eco-a5-template \.eco-total\s*\{[^}]*\}/s)?.[0] || '';
    expect(totalRule).not.toContain('border-top');
    expect(css).toMatch(
      /\.eco-note-cell--contents p\s*\{[^}]*font-size:\s*var\(--fs-row\);[^}]*font-weight:\s*400;/s,
    );
    expect(css).toMatch(/\.eco-a5-people-row\s*\{[^}]*align-content:\s*start;/s);
    expect(css).toMatch(/\.eco-a5-people-row\s*\{[^}]*min-height:\s*38mm;/s);
    expect(css).toMatch(
      /\.eco-band--receiver-details\s*\{[^}]*justify-content:\s*flex-start;[^}]*gap:\s*1mm;[^}]*font-size:\s*var\(--fs-row\);[^}]*line-height:\s*1\.45;/s,
    );
    expect(css).toMatch(
      /\.eco-band--receiver-details \.eco-mini-line--ward\s*\{[^}]*grid-template-columns:\s*max-content minmax\(0,\s*1fr\);[^}]*column-gap:\s*1\.2mm;/s,
    );
    expect(css).toMatch(
      /\.eco-two-col-line--receiver-contact\s*\{[^}]*grid-template-columns:\s*47mm minmax\(0,\s*1fr\);[^}]*column-gap:\s*2\.5mm;/s,
    );
    expect(css).toMatch(
      /\.eco-a5-people-row \.eco-mini-line--address\s*\{[^}]*grid-template-columns:\s*max-content minmax\(0,\s*1fr\);/s,
    );
    expect(css).not.toContain('-webkit-line-clamp');
    expect(css).toMatch(
      /\.eco-a5-people-row \.eco-mini-line--address \.eco-mini-value\s*\{[^}]*display:\s*block;[^}]*white-space:\s*normal;/s,
    );
    expect(css).toMatch(
      /\.eco-two-col-line--dest\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) max-content;[^}]*font-size:\s*calc\(11\.5pt \* var\(--eco-a5-scale\)\);/s,
    );
    expect(css).toMatch(
      /\.eco-two-col-line--dest \.eco-mini-value\s*\{[^}]*overflow-wrap:\s*normal;[^}]*white-space:\s*nowrap;/s,
    );
    expect(css).toMatch(
      /\.eco-header-post-code\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*0\.8mm;[^}]*font-size:\s*var\(--fs-row\);/s,
    );
    expect(css).toMatch(
      /\.eco-stat-value\s*\{[^}]*font-size:\s*var\(--fs-row\);[^}]*font-weight:\s*400;/s,
    );
    expect(css).toMatch(
      /\.eco-a5-goods-code\s*\{[^}]*font-size:\s*var\(--fs-sm\);[^}]*font-weight:\s*400;/s,
    );
    expect(css).toMatch(
      /\.eco-note-cell p\s*\{[^}]*font-size:\s*var\(--fs-base\);[^}]*font-weight:\s*400;/s,
    );
  });

  it('fits the printed invoice inside safe printer margins on one page', () => {
    expect(css).toMatch(/@page\s*\{[^}]*size:\s*A4 portrait;[^}]*margin:\s*5mm;/s);
    expect(css).toMatch(
      /@media print\s*\{[\s\S]*?\.waybill-paper-preview\s*\{[^}]*width:\s*189mm\s*!important;[^}]*height:\s*140mm\s*!important;/s,
    );
    expect(css).toMatch(
      /@media print\s*\{[\s\S]*?\.waybill-invoice\s*\{[^}]*transform:\s*scale\(0\.94\);[^}]*transform-origin:\s*top left;/s,
    );
  });

  it('only exposes A4 portrait printing and ignores the retired A5 mode', () => {
    expect(css).not.toMatch(/size:\s*A5 landscape;/);
    expect(singlePrintPage).not.toContain('A5 ngang');
    expect(singlePrintPage).not.toContain("format === 'a5'");
    expect(bulkPrintPage).not.toContain('A5 ngang');
    expect(bulkPrintPage).not.toContain("format === 'a5'");
  });

  it('removes the note heading separator and draws both vertical splits as continuous lines', () => {
    const noteHeadingRule = css.match(/\.eco-note-heading\s*\{[^}]*\}/s)?.[0] || '';
    const paymentMethodRule = css.match(/\.eco-payment-method-box\s*\{[^}]*\}/s)?.[0] || '';
    const extraInfoRule = css.match(/\.eco-extra-info-box\s*\{[^}]*\}/s)?.[0] || '';
    const footerServiceRule = css.match(/\.eco-footer-service\s*\{[^}]*\}/s)?.[0] || '';

    expect(noteHeadingRule).not.toContain('border-bottom');
    expect(css).toMatch(
      /\.waybill-invoice::before\s*\{[^}]*top:\s*34mm;[^}]*left:\s*calc\(var\(--eco-a5-split\) \+ var\(--eco-line-strong-width\)\);[^}]*border-left:\s*var\(--eco-line-strong\);/s,
    );
    expect(css).toMatch(
      /\.waybill-invoice::after\s*\{[^}]*top:\s*72mm;[^}]*left:\s*calc\(var\(--eco-a5-split\) \+ 50mm \+ var\(--eco-line-strong-width\)\);[^}]*border-left:\s*var\(--eco-line\);/s,
    );
    expect(css).toMatch(
      /\.eco-note-grid::after\s*\{[^}]*top:\s*0;[^}]*bottom:\s*0;[^}]*left:\s*50%;[^}]*border-left:\s*var\(--eco-line\);/s,
    );
    expect(css).not.toMatch(/\.eco-band--left\s*\{[^}]*border-right:/s);
    expect(paymentMethodRule).not.toContain('border-right');
    expect(extraInfoRule).not.toContain('border-right');
    expect(footerServiceRule).not.toContain('border-right');
    const statLabelRule = css.match(/\.eco-stat-cell > div\s*\{[^}]*\}/s)?.[0] || '';
    expect(statLabelRule).not.toContain('border-bottom');
  });
});
