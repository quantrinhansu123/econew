import type { IncomingTrip } from './types';

export type MainIncomingHub = 'HCM' | 'HAN';

const normalizeHubText = (value?: string | null) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toUpperCase();

function matchesMainHub(code: string | null | undefined, name: string | null | undefined, hub: MainIncomingHub) {
  const normalizedCode = normalizeHubText(code);
  const normalizedName = normalizeHubText(name);
  if (hub === 'HCM') {
    return normalizedCode === 'HCM'
      || normalizedCode.startsWith('HCM_')
      || normalizedName.includes('HO CHI MINH');
  }
  return normalizedCode === 'HAN'
    || normalizedCode === 'HN'
    || normalizedCode.startsWith('HAN_')
    || normalizedName.includes('HA NOI');
}

export function getIncomingTripMainHubs(trip: IncomingTrip): MainIncomingHub[] {
  const hubs = [
    trip.end_hub,
    trip.dest_hub,
    trip.manifest?.dest_hub,
    ...(trip.route_stops ?? []).map((stop) => ({ code: stop.hub_code, name: stop.hub_name })),
  ].filter(Boolean);

  return (['HCM', 'HAN'] as const).filter((hub) => (
    hubs.some((candidate) => matchesMainHub(candidate?.code, candidate?.name, hub))
  ));
}

export function groupIncomingTripsByMainHub(trips: IncomingTrip[]) {
  const grouped: Record<MainIncomingHub, IncomingTrip[]> = { HCM: [], HAN: [] };
  trips.forEach((trip) => {
    getIncomingTripMainHubs(trip).forEach((hub) => grouped[hub].push(trip));
  });
  return grouped;
}
