import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./waybill-invoice.css', import.meta.url), 'utf8');

describe('waybill invoice marked layout', () => {
  it('removes only the outer frame and keeps explicit receiver/sender grid placement', () => {
    expect(css).toMatch(/\.waybill-invoice\s*\{[^}]*border:\s*0;/s);
    expect(css).toMatch(/\.eco-band--receiver-summary\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/s);
    expect(css).toMatch(/\.eco-recipient-summary\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s);
    expect(css).toMatch(/\.eco-band--sender-contact\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*4;/s);
    expect(css).toMatch(/\.eco-band--receiver-contact\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*4;/s);
    expect(css).toMatch(/\.eco-phone-numbers\s*\{[^}]*display:\s*inline-flex;/s);
  });
});
