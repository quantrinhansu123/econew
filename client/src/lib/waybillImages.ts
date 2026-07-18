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
