import { describe, expect, it } from 'vitest';
import type { LoadPlanningManifest } from './types';
import {
  groupManifestPrintLinksByDestination,
  normalizeManifestPrintLinks,
} from './manifestDispatchPrintUtils';

describe('manifest dispatch print grouping', () => {
  it('creates one printable sheet for each destination hub', () => {
    const manifest: LoadPlanningManifest = {
      id: 10,
      dest_hub_id: 2,
      dest_hub: { id: 2, code: 'HCM', name: 'Hồ Chí Minh' },
      manifest_waybills: [
        { waybill_id: 1, loading_position: 3, dispatch_fields: { expected_arrival_at: '2026-08-10T09:00:00Z' }, waybill: { id: 1, waybill_code: 'HCM-1', dest_hub_id: 2, dest_hub: { id: 2, code: 'HCM' } } },
        { waybill_id: 2, loading_position: 1, dispatch_fields: { expected_arrival_at: '2026-08-09T09:00:00Z' }, waybill: { id: 2, waybill_code: 'DAN-1', dest_hub_id: 3, dest_hub: { id: 3, code: 'DAN' } } },
        { waybill_id: 3, loading_position: 2, dispatch_fields: { expected_arrival_at: '2026-08-10T09:00:00Z' }, waybill: { id: 3, waybill_code: 'HCM-2', dest_hub_id: 2, dest_hub: { id: 2, code: 'HCM' } } },
      ],
    };

    const groups = groupManifestPrintLinksByDestination(
      manifest,
      normalizeManifestPrintLinks(manifest),
    );

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.hub?.code)).toEqual(['DAN', 'HCM']);
    expect(groups.map((group) => group.links.map((link) => link.waybill?.waybill_code))).toEqual([
      ['DAN-1'],
      ['HCM-2', 'HCM-1'],
    ]);
  });

  it('orders printed HUB sheets by each HUB expected arrival time', () => {
    const manifest: LoadPlanningManifest = {
      id: 11,
      manifest_waybills: [
        { waybill_id: 1, loading_position: 1, dispatch_fields: { expected_arrival_at: '2026-08-10T18:00:00Z' }, waybill: { id: 1, dest_hub_id: 2, dest_hub: { id: 2, code: 'HCM' } } },
        { waybill_id: 2, loading_position: 2, dispatch_fields: { expected_arrival_at: '2026-08-09T08:00:00Z' }, waybill: { id: 2, dest_hub_id: 3, dest_hub: { id: 3, code: 'KHANHHOA' } } },
      ],
    };

    const groups = groupManifestPrintLinksByDestination(manifest, normalizeManifestPrintLinks(manifest));

    expect(groups.map((group) => group.hub?.code)).toEqual(['KHANHHOA', 'HCM']);
  });

  it('falls back to the manifest destination for legacy rows without hub data', () => {
    const manifest: LoadPlanningManifest = {
      id: 10,
      dest_hub_id: 2,
      dest_hub: { id: 2, code: 'HCM' },
      waybills: [{ id: 1, waybill_code: 'LEGACY-1' }],
    };

    const groups = groupManifestPrintLinksByDestination(
      manifest,
      normalizeManifestPrintLinks(manifest),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ hubId: 2, hub: { code: 'HCM' } });
  });
});
