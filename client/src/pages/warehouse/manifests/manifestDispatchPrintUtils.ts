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
