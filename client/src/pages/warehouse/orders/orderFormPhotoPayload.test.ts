import { describe, expect, it } from 'vitest';

import { resolveWaybillPhotoField } from './orderFormUtils';

describe('waybill photo payload intent', () => {
  it('omits an untouched empty photo field when creating', () => {
    expect(resolveWaybillPhotoField([], 'create')).toBeUndefined();
  });

  it('persists clear-all as null when updating', () => {
    expect(resolveWaybillPhotoField([], 'update')).toBeNull();
  });

  it('serializes up to four unique photo URLs', () => {
    expect(resolveWaybillPhotoField([
      'https://cdn.example.com/1.jpg',
      'https://cdn.example.com/1.jpg',
      'https://cdn.example.com/2.jpg',
      'https://cdn.example.com/3.jpg',
      'https://cdn.example.com/4.jpg',
      'https://cdn.example.com/5.jpg',
    ], 'update')).toBe([
      'https://cdn.example.com/1.jpg',
      'https://cdn.example.com/2.jpg',
      'https://cdn.example.com/3.jpg',
      'https://cdn.example.com/4.jpg',
    ].join('|'));
  });
});
