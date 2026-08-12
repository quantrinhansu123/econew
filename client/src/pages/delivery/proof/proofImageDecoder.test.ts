import { describe, expect, it } from 'vitest';
import { PROOF_IMAGE_DESKEW_ANGLES, PROOF_IMAGE_REGIONS, PROOF_IMAGE_ROTATIONS } from './proofImageDecoder';

describe('proof image decoder plan', () => {
  it('tries every right-angle rotation used by phone photos', () => {
    expect(PROOF_IMAGE_ROTATIONS).toEqual([0, 90, 270, 180]);
  });

  it('tries both the full image and focused label-header regions', () => {
    expect(PROOF_IMAGE_REGIONS).toEqual(['FULL', 'HEADER', 'TOP_RIGHT', 'BARCODE_STRIP']);
  });

  it('deskews the small camera tilts seen in proof photos', () => {
    expect(PROOF_IMAGE_DESKEW_ANGLES).toEqual([0, -6, 6, -12, 12]);
  });
});
