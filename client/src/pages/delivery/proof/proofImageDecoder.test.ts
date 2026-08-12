import { describe, expect, it } from 'vitest';
import { PROOF_IMAGE_REGIONS, PROOF_IMAGE_ROTATIONS, PROOF_ZXING_BUDGET_MS } from './proofImageDecoder';

describe('proof image decoder plan', () => {
  it('tries every right-angle rotation used by phone photos', () => {
    expect(PROOF_IMAGE_ROTATIONS).toEqual([0, 90, 270, 180]);
  });

  it('tries only the focused ECO label-header regions before Gemini fallback', () => {
    expect(PROOF_IMAGE_REGIONS).toEqual(['BARCODE_STRIP', 'TOP_RIGHT']);
  });

  it('keeps the local barcode pass under a short latency budget', () => {
    expect(PROOF_ZXING_BUDGET_MS).toBe(900);
  });
});
