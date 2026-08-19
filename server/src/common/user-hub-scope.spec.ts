import { getAssignedHubIds, getDefaultHubId, isAssignedToHub } from './user-hub-scope';

describe('user hub scope', () => {
  it('combines the legacy primary hub and N-N assignments without duplicates', () => {
    const user = {
      hub_id: '1',
      hub_ids: ['1', '2'],
      hubs: [{ id: '2' }],
      user_hubs: [{ hub_id: '3', hub: { id: '3' } }],
    };

    expect(getAssignedHubIds(user)).toEqual(['1', '2', '3']);
    expect(getDefaultHubId(user)).toBe('1');
    expect(isAssignedToHub(user, '2')).toBe(true);
    expect(isAssignedToHub(user, '4')).toBe(false);
  });
});
