const OVERFLOW_EPSILON_PX = 1;

export function isIncomingTripTableOverflowing(scrollWidth: number, viewportWidth: number): boolean {
  return Number.isFinite(scrollWidth)
    && Number.isFinite(viewportWidth)
    && scrollWidth > viewportWidth + OVERFLOW_EPSILON_PX;
}

export function shouldShowIncomingHorizontalRail(
  scrollWidth: number,
  viewportWidth: number,
  railWidth: number,
): boolean {
  return isIncomingTripTableOverflowing(scrollWidth, viewportWidth)
    && Number.isFinite(railWidth)
    && railWidth > 0;
}
