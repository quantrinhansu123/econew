import { BadRequestException } from '@nestjs/common';

export const MAX_WAYBILL_PHOTOS = 4;

export function parseWaybillPhotos(value?: string | null): string[] {
  if (!value?.trim()) return [];
  return [...new Set(
    value
      .split(/[|\n]/)
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

export function normalizeWaybillPhotos(value?: string | null): string | null {
  const photos = parseWaybillPhotos(value);
  if (photos.length > MAX_WAYBILL_PHOTOS) {
    throw new BadRequestException(`Mỗi vận đơn chỉ được gắn tối đa ${MAX_WAYBILL_PHOTOS} ảnh.`);
  }
  return photos.length ? photos.join('|') : null;
}
