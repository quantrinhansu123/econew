import { describe, expect, it } from 'vitest';
import { canAddWaybillsToManifest, canRemoveWaybillsFromManifest } from './types';

describe('manifest cargo editing permissions', () => {
  it('allows add and remove while the vehicle is in transit or departed', () => {
    for (const tripStatus of ['IN_TRANSIT', 'DEPARTED']) {
      const manifest = { status: 'IN_TRANSIT', trip: { status: tripStatus } };
      expect(canAddWaybillsToManifest(manifest)).toBe(true);
      expect(canRemoveWaybillsFromManifest(manifest)).toBe(true);
    }
  });

  it('locks cargo after arrival', () => {
    const manifest = { status: 'IN_TRANSIT', trip: { status: 'ARRIVED' } };
    expect(canAddWaybillsToManifest(manifest)).toBe(false);
    expect(canRemoveWaybillsFromManifest(manifest)).toBe(false);
  });
});
