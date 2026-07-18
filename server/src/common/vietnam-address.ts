export interface VietnamAddressParts {
  ward: string;
  district: string;
}

const cleanPart = (value: string) =>
  value
    .trim()
    .replace(/^[,;.\s]+|[,;.\s]+$/g, '')
    .replace(/\s+/g, ' ');

const WARD_PREFIX = /^(?:phường|p(?:hường)?\.?|xã|x\.?|thị trấn|tt\.?)\s*\S+/i;
const DISTRICT_PREFIX = /^(?:quận|q(?:uận)?\.?|huyện|h\.?|thị xã|tx\.?)\s*\S+/i;
const DISTRICT_CITY_PREFIX = /^(?:thành phố|tp\.?)\s*\S+/i;
const PROVINCE_LEVEL_CITY = /(?:hồ\s*chí\s*minh|ho\s*chi\s*minh|hcm|hà\s*nội|ha\s*noi|hanoi|đà\s*nẵng|da\s*nang)/i;

/** Fallback cho vận đơn cũ chỉ lưu địa chỉ nhận dạng chuỗi. */
export function extractVietnamAddressParts(address?: string | null): VietnamAddressParts {
  const parts = String(address || '')
    .split(/[,\n;]/)
    .map(cleanPart)
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
