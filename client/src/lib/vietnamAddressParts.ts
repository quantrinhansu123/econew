export interface VietnamAddressParts {
  ward: string;
  district: string;
}

const trimAddressPart = (value: string) =>
  value
    .trim()
    .replace(/^[,;.\s]+|[,;.\s]+$/g, '')
    .replace(/\s+/g, ' ');

const WARD_PREFIX = /^(?:phường|p(?:hường)?\.?|xã|x\.?|thị trấn|tt\.?)\s*\S+/i;
const DISTRICT_PREFIX = /^(?:quận|q(?:uận)?\.?|huyện|h\.?|thị xã|tx\.?)\s*\S+/i;
const DISTRICT_CITY_PREFIX = /^(?:thành phố|tp\.?)\s*\S+/i;
const PROVINCE_LEVEL_CITY = /(?:hồ\s*chí\s*minh|ho\s*chi\s*minh|hcm|hà\s*nội|ha\s*noi|hanoi|đà\s*nẵng|da\s*nang)/i;

/**
 * Fallback cho bill cũ chưa có trường địa bàn riêng.
 * Chỉ nhận diện thành phần có tiền tố hành chính để tránh đoán sai tên đường.
 */
export function extractVietnamAddressParts(address?: string | null): VietnamAddressParts {
  const parts = String(address || '')
    .split(/[,\n;]/)
    .map(trimAddressPart)
    .filter(Boolean);

  const reversedParts = [...parts].reverse();
  return {
    ward: reversedParts.find((part) => WARD_PREFIX.test(part)) || '',
    district:
      reversedParts.find((part) => DISTRICT_PREFIX.test(part))
      || reversedParts.find((part) => DISTRICT_CITY_PREFIX.test(part) && !PROVINCE_LEVEL_CITY.test(part))
      || '',
  };
}

export function resolveVietnamWard(explicitValue?: string | null, address?: string | null): string {
  return trimAddressPart(String(explicitValue || '')) || extractVietnamAddressParts(address).ward;
}

export function resolveVietnamDistrict(explicitValue?: string | null, address?: string | null): string {
  return trimAddressPart(String(explicitValue || '')) || extractVietnamAddressParts(address).district;
}
