export const MAX_WAYBILL_IMAGES = 4;

export function parseWaybillImages(value?: string | null): string[] {
  if (!value?.trim()) return [];
  return [...new Set(
    value
      .split(/[|\n]/)
      .map((item) => item.trim())
      .filter(Boolean),
  )].slice(0, MAX_WAYBILL_IMAGES);
}

export function joinWaybillImages(urls: string[]): string {
  return [...new Set(urls.map((item) => item.trim()).filter(Boolean))]
    .slice(0, MAX_WAYBILL_IMAGES)
    .join('|');
}

export function isPublicImageUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** URL do endpoint upload vận đơn sinh ra; không chấp nhận URL/placeholder tự nhập. */
export function isUploadedWaybillImageUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && /\/storage\/v1\/object\/public\/[^/]+\/waybills\/\d{13}-[a-f0-9]{16}\.(?:jpe?g|png|webp|gif)$/i.test(url.pathname);
  } catch {
    return false;
  }
}
