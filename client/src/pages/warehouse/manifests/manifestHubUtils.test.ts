import { describe, expect, it } from 'vitest';
import type { LoadPlanningManifest } from './types';
import {
  filterActiveOutboundFromHub,
  filterExpectedInboundToHub,
  resolveManifestBoardGroup,
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
  it('maps a planned HAN to HCM trip to the origin and destination contexts', () => {
    const planned = manifest('PLANNED');

    expect(resolveManifestBoardGroup(planned, 'HAN')).toBe('departed');
    expect(resolveManifestBoardGroup(planned, 'HCM')).toBe('expected');
    expect(filterActiveOutboundFromHub([planned], 'HAN')).toEqual([planned]);
    expect(filterExpectedInboundToHub([planned], 'HCM')).toEqual([planned]);
  });

  it('excludes an arrived trip from both active lanes', () => {
    const arrived = manifest('ARRIVED');

    expect(resolveManifestBoardGroup(arrived, 'HCM')).toBe('arrived');
    expect(filterActiveOutboundFromHub([arrived], 'HAN')).toEqual([]);
    expect(filterExpectedInboundToHub([arrived], 'HCM')).toEqual([]);
  });
});
