const HUB_CODES = new Set(['HAN', 'HCM', 'DNG', 'SGN', 'SG']);

/** Lấy tỉnh/thành từ địa chỉ nhận — ưu tiên phần cuối sau dấu phẩy */
export function extractProvinceFromAddress(address?: string | null): string {
  const raw = String(address ?? '').trim();
  if (!raw) return '';

  const parts = raw
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const normalized = normalizeProvinceLabel(parts[index]);
    if (normalized.length >= 3) return normalized;
  }

  return normalizeProvinceLabel(parts[parts.length - 1] ?? raw);
}

export function normalizeProvinceLabel(value: string): string {
  return value
    .replace(/^(tỉnh|tinh|tp\.?|thành phố|thanh pho|tp)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isHubCode(value?: string | null): boolean {
  const normalized = String(value ?? '').trim().toUpperCase();
  return Boolean(normalized) && HUB_CODES.has(normalized);
}
