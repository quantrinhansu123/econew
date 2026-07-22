import {
  isUploadedWaybillImageUrl,
  joinWaybillImages,
  parseWaybillImages,
} from '../../../lib/waybillImages';

export type DeliveryStatus = 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'RETURNED';

export interface DeliveryStatusPayload {
  status: DeliveryStatus;
  delivery_photo_url?: string;
}

export function getAllowedDeliveryStatuses(currentState?: string | null): DeliveryStatus[] {
  const state = String(currentState || '').trim().toUpperCase();
  if (state === 'AT_DEST_HUB') return ['OUT_FOR_DELIVERY'];
  if (state === 'OUT_FOR_DELIVERY') return ['DELIVERED', 'RETURNED'];
  return [];
}

export function getUsableDeliveryPhotos(value?: string | null): string[] {
  return parseWaybillImages(value).filter(isUploadedWaybillImageUrl);
}

export function buildDeliveryStatusPayload(
  status: DeliveryStatus,
  deliveryPhotos: string[] = [],
): DeliveryStatusPayload {
  if (status !== 'DELIVERED') return { status };

  const deliveryPhotoUrl = joinWaybillImages(deliveryPhotos.filter(isUploadedWaybillImageUrl));
  if (!deliveryPhotoUrl) {
    throw new Error('Vui lòng upload ít nhất 1 ảnh giao hàng trước khi xác nhận.');
  }

  return {
    status,
    delivery_photo_url: deliveryPhotoUrl,
  };
}
