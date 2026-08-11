import { describe, expect, it } from 'vitest';
import { PROOF_IMAGE_REGIONS, PROOF_IMAGE_ROTATIONS } from './proofImageDecoder';

describe('proof image decoder plan', () => {
  it('tries every right-angle rotation used by phone photos', () => {
    expect(PROOF_IMAGE_ROTATIONS).toEqual([0, 90, 270, 180]);
  });

  it('tries both the full image and focused label-header regions', () => {
    expect(PROOF_IMAGE_REGIONS).toEqual(['FULL', 'HEADER', 'TOP_RIGHT']);
  });
});
