import { describe, expect, it } from 'vitest';
import {
  isIncomingTripTableOverflowing,
  shouldShowIncomingHorizontalRail,
} from './incomingTripTableScroll';

describe('incoming trip table horizontal rail', () => {
  it('stays hidden before data is mounted and appears when the table overflows afterwards', () => {
    expect(isIncomingTripTableOverflowing(0, 1768)).toBe(false);
    expect(shouldShowIncomingHorizontalRail(0, 1768, 1772)).toBe(false);

    // This is the post-fetch layout: the table is wider than the viewport.
    expect(isIncomingTripTableOverflowing(1840, 1768)).toBe(true);
    expect(shouldShowIncomingHorizontalRail(1840, 1768, 1772)).toBe(true);
  });

  it('does not render a rail when content fits or the viewport has no measurable width', () => {
    expect(shouldShowIncomingHorizontalRail(1768, 1768, 1772)).toBe(false);
    expect(shouldShowIncomingHorizontalRail(1840, 1768, 0)).toBe(false);
    expect(shouldShowIncomingHorizontalRail(Number.NaN, 1768, 1772)).toBe(false);
  });
});
