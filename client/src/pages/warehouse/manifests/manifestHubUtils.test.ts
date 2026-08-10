import { describe, expect, it } from 'vitest';
import type { LoadPlanningManifest } from './types';
import {
  filterActiveOutboundFromHub,
  filterExpectedInboundToHub,
  resolveManifestBoardGroup,
  splitActiveManifestsByMainHubOrigin,
} from './manifestHubUtils';

const manifest = (tripStatus: string): LoadPlanningManifest => ({
  id: `manifest-${tripStatus}`,
  status: 'CLOSED',
  origin_hub: { id: 1, code: 'HAN', name: 'Hà Nội' },
  dest_hub: { id: 2, code: 'HCM', name: 'Hồ Chí Minh' },
  trip: {
    id: `trip-${tripStatus}`,
    status: tripStatus,
    expected_arrival_time: '2026-07-23T08:00:00.000Z',
  },
});

describe('manifest HUB lanes', () => {
  it('does not show a planned trip before departure', () => {
    const planned = manifest('PLANNED');

    expect(resolveManifestBoardGroup(planned, 'HAN')).toBe('other');
    expect(resolveManifestBoardGroup(planned, 'HCM')).toBe('other');
    expect(filterActiveOutboundFromHub([planned], 'HAN')).toEqual([]);
    expect(filterExpectedInboundToHub([planned], 'HCM')).toEqual([]);
  });

  it('keeps only running trips in the departure and destination lanes', () => {
    const running = manifest('IN_TRANSIT');
    const arrived = manifest('ARRIVED');
    const completed = manifest('COMPLETED');

    expect(resolveManifestBoardGroup(arrived, 'HCM')).toBe('arrived');
    expect(filterActiveOutboundFromHub([running, arrived, completed], 'HAN')).toEqual([running]);
    expect(filterExpectedInboundToHub([running, arrived, completed], 'HCM')).toEqual([running]);
  });

  it('splits running manifests by departure hub regardless of destination hub', () => {
    const fromHan = manifest('IN_TRANSIT');
    const fromHcm = {
      ...manifest('IN_TRANSIT'),
      id: 'manifest-from-hcm',
      origin_hub: { id: 2, code: 'HCM', name: 'Hồ Chí Minh' },
      dest_hub: { id: 3, code: 'NINHTHUAN', name: 'Ninh Thuận' },
    };

    expect(splitActiveManifestsByMainHubOrigin([fromHan, fromHcm])).toEqual({
      HAN: [fromHan],
      HCM: [fromHcm],
    });
  });
});
