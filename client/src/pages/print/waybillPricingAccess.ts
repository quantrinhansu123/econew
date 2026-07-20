const WAYBILL_PRICING_ROLES = 32 | 64;

export function canViewWaybillPricing(roleMask?: number | null) {
  return (Number(roleMask ?? 0) & WAYBILL_PRICING_ROLES) !== 0;
}

export function shouldShowWaybillPricing(
  roleMask: number | null | undefined,
  pricingParam: string | null,
) {
  return canViewWaybillPricing(roleMask) && pricingParam === 'show';
}
