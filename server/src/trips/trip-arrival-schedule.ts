type ArrivalSplit = {
  expected_arrival_at?: Date | string | null;
  waybill?: { dest_hub_id?: string | number | null } | null;
};

export type TripArrivalSchedule = {
  finalExpectedArrival: Date | null;
  splitExpectedArrival: Date | null;
  isMultiHub: boolean;
  hasCompleteHubSchedule: boolean;
};

const validDate = (value?: Date | string | null): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function resolveTripArrivalSchedule(
  splits: ArrivalSplit[],
  fallbackExpectedArrival?: Date | string | null,
): TripArrivalSchedule {
  const destinationHubIds = new Set<string>();
  const scheduledHubIds = new Set<string>();
  let splitExpectedArrival: Date | null = null;

  splits.forEach((split) => {
    const hubId = String(split.waybill?.dest_hub_id ?? '').trim();
    if (hubId) destinationHubIds.add(hubId);

    const expectedArrival = validDate(split.expected_arrival_at);
    if (!expectedArrival) return;
    if (hubId) scheduledHubIds.add(hubId);
    if (!splitExpectedArrival || expectedArrival > splitExpectedArrival) {
      splitExpectedArrival = expectedArrival;
    }
  });

  const isMultiHub = destinationHubIds.size > 1;
  const hasCompleteHubSchedule = !isMultiHub || scheduledHubIds.size === destinationHubIds.size;

  return {
    finalExpectedArrival: splitExpectedArrival ?? validDate(fallbackExpectedArrival),
    splitExpectedArrival,
    isMultiHub,
    hasCompleteHubSchedule,
  };
}
