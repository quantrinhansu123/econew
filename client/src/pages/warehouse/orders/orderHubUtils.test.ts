import { describe, expect, it } from 'vitest';
import type { HubSummary } from './types';
import { getDefaultOriginHubId, getPreferredDestinationHub } from './orderHubUtils';

const hubs: HubSummary[] = [
  { id: '3', code: 'DNG', name: 'HUB Đà Nẵng' },
  { id: '1', code: 'HAN', name: 'HUB Hà Nội' },
  { id: '2', code: 'HCM', name: 'HUB Hồ Chí Minh' },
];

describe('order HUB defaults', () => {
  it('uses the assigned HUB as origin and HCM as destination by default', () => {
    const originHubId = getDefaultOriginHubId(hubs, '1');

    expect(originHubId).toBe('1');
    expect(getPreferredDestinationHub(hubs, originHubId)?.code).toBe('HCM');
  });

  it('selects another active HUB when the origin is HCM', () => {
    expect(getPreferredDestinationHub(hubs, '2')?.id).not.toBe('2');
  });

  it('falls back to HAN as origin when the user has no assigned HUB', () => {
    expect(getDefaultOriginHubId(hubs)).toBe('1');
  });
});
