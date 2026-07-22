import { describe, expect, it } from 'vitest';

import {
  buildDeliveryStatusPayload,
  getAllowedDeliveryStatuses,
  getUsableDeliveryPhotos,
} from './deliveryStatusUtils';

describe('last-mile state transitions', () => {
  it('never offers a direct AT_DEST_HUB to DELIVERED transition', () => {
    expect(getAllowedDeliveryStatuses('AT_DEST_HUB')).toEqual(['OUT_FOR_DELIVERY']);
    expect(getAllowedDeliveryStatuses('OUT_FOR_DELIVERY')).toEqual(['DELIVERED', 'RETURNED']);
  });
});

describe('delivered photo payload', () => {
  const firstUpload = 'https://project.supabase.co/storage/v1/object/public/payment-proofs/waybills/1770000000000-0123456789abcdef.jpg';
  const secondUpload = 'https://project.supabase.co/storage/v1/object/public/payment-proofs/waybills/1770000000001-fedcba9876543210.png';

  it('requires a real public image URL for DELIVERED', () => {
    expect(() => buildDeliveryStatusPayload('DELIVERED', [])).toThrow(/ít nhất 1 ảnh/);
    expect(() => buildDeliveryStatusPayload('DELIVERED', ['pending-upload'])).toThrow(/ít nhất 1 ảnh/);
  });

  it('joins successful photos and excludes invalid legacy sentinels', () => {
    expect(buildDeliveryStatusPayload('DELIVERED', [
      firstUpload,
      'pending-upload',
      secondUpload,
    ])).toEqual({
      status: 'DELIVERED',
      delivery_photo_url: `${firstUpload}|${secondUpload}`,
    });
  });

  it('does not attach delivery photos to non-delivered transitions', () => {
    expect(buildDeliveryStatusPayload('OUT_FOR_DELIVERY', ['https://cdn.example.com/photo.jpg']))
      .toEqual({ status: 'OUT_FOR_DELIVERY' });
    expect(buildDeliveryStatusPayload('RETURNED', ['https://cdn.example.com/photo.jpg']))
      .toEqual({ status: 'RETURNED' });
  });

  it('drops malformed image values loaded from legacy records', () => {
    expect(getUsableDeliveryPhotos(`pending-upload|https://cdn.example.com/valid.jpg|${firstUpload}`))
      .toEqual([firstUpload]);
  });
});
