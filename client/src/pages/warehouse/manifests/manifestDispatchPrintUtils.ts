import type { DispatchLink } from './manifestDispatchDefaults';
import type { LoadPlanningManifest, ManifestDispatchFields } from './types';
import { rowKey } from './ManifestDispatchSheetTable';

export function manifestPrintCode(manifest: LoadPlanningManifest) {
  return manifest.manifest_code || manifest.code || `BK-${manifest.id}`;
}

export function manifestPrintTrip(manifest: LoadPlanningManifest) {
  return manifest.trip ?? manifest.trips?.[0] ?? null;
}

export function normalizeManifestPrintLinks(manifest: LoadPlanningManifest): DispatchLink[] {
  if (manifest.manifest_waybills?.length) return manifest.manifest_waybills as DispatchLink[];
  return (manifest.waybills ?? []).map((waybill, index) => ({
    waybill_id: waybill.id,
    loading_position: waybill.loading_position ?? index + 1,
    dispatch_fields: waybill.dispatch_fields,
    waybill,
  }));
}

export function buildManifestPrintRows(links: DispatchLink[]): Record<string, ManifestDispatchFields> {
  const rows: Record<string, ManifestDispatchFields> = {};
  links.forEach((link) => {
    const key = rowKey(link);
    if (!key) return;
    rows[key] = {
      ...(link.waybill?.dispatch_fields ?? {}),
      ...(link.dispatch_fields ?? {}),
    };
  });
  return rows;
}

export function sortManifestPrintLinks(links: DispatchLink[]) {
  return [...links].sort(
    (a, b) => Number(a.loading_position ?? 9999) - Number(b.loading_position ?? 9999),
  );
}

export interface ManifestPrintDestinationGroup {
  key: string;
  hubId?: string | number | null;
  hub?: { id?: string | number | null; code?: string | null; name?: string | null } | null;
  links: DispatchLink[];
}

export function groupManifestPrintLinksByDestination(
  manifest: LoadPlanningManifest,
  links: DispatchLink[],
): ManifestPrintDestinationGroup[] {
  const groups = new Map<string, ManifestPrintDestinationGroup>();

  sortManifestPrintLinks(links).forEach((link) => {
    const hub = link.waybill?.dest_hub ?? manifest.dest_hub ?? null;
    const hubId = link.waybill?.dest_hub_id ?? hub?.id ?? manifest.dest_hub_id ?? null;
    const code = String(hub?.code || '').trim().toLocaleUpperCase('vi-VN');
    const name = String(hub?.name || '').trim().toLocaleLowerCase('vi-VN');
    const key = hubId != null && String(hubId).trim()
      ? `id:${String(hubId).trim()}`
      : code
        ? `code:${code}`
        : name
          ? `name:${name}`
          : 'unknown';
    const current: ManifestPrintDestinationGroup = groups.get(key) ?? { key, hubId, hub, links: [] };
    current.links.push(link);
    groups.set(key, current);
  });

  return [...groups.values()];
}
