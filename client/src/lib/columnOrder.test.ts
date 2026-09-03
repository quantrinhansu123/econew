import { describe, expect, it } from 'vitest';
import { moveItemBefore } from './columnOrder';

describe('moveItemBefore', () => {
  it('moves a selected column before the drop target', () => {
    expect(moveItemBefore(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
    expect(moveItemBefore(['a', 'b', 'c', 'd'], 'a', 'd')).toEqual(['b', 'c', 'a', 'd']);
  });

  it('leaves the list unchanged for invalid drag data', () => {
    const ids = ['a', 'b'];
    expect(moveItemBefore(ids, 'a', 'a')).toBe(ids);
    expect(moveItemBefore(ids, 'missing', 'a')).toBe(ids);
  });
});
