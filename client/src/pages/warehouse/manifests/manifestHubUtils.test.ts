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
  it('does not show a planned trip before departure', () => {
    const planned = manifest('PLANNED');

    expect(resolveManifestBoardGroup(planned, 'HAN')).toBe('other');
    expect(resolveManifestBoardGroup(planned, 'HCM')).toBe('other');
    expect(filterActiveOutboundFromHub([planned], 'HAN')).toEqual([]);
    expect(filterExpectedInboundToHub([planned], 'HCM')).toEqual([]);
  });

  it('maps an in-transit trip to departed and expected lanes', () => {
    const inTransit = manifest('IN_TRANSIT');

    expect(resolveManifestBoardGroup(inTransit, 'HAN')).toBe('departed');
    expect(resolveManifestBoardGroup(inTransit, 'HCM')).toBe('expected');
    expect(filterActiveOutboundFromHub([inTransit], 'HAN')).toEqual([inTransit]);
    expect(filterExpectedInboundToHub([inTransit], 'HCM')).toEqual([inTransit]);
  });

  it('excludes an arrived trip from both active lanes', () => {
    const arrived = manifest('ARRIVED');

    expect(resolveManifestBoardGroup(arrived, 'HCM')).toBe('arrived');
    expect(filterActiveOutboundFromHub([arrived], 'HAN')).toEqual([]);
    expect(filterExpectedInboundToHub([arrived], 'HCM')).toEqual([]);
  });
});
