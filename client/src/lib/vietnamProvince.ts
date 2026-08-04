const HUB_CODES = new Set(['HAN', 'HCM', 'DNG', 'SGN', 'SG']);

/** Danh sách 63 tỉnh/thành trước đợt sắp xếp hành chính năm 2025. */
export const VIETNAM_PROVINCES_63 = [
  'An Giang',
  'Bà Rịa - Vũng Tàu',
  'Bạc Liêu',
  'Bắc Giang',
  'Bắc Kạn',
  'Bắc Ninh',
  'Bến Tre',
  'Bình Dương',
  'Bình Định',
  'Bình Phước',
  'Bình Thuận',
  'Cà Mau',
  'Cao Bằng',
  'Cần Thơ',
  'Đà Nẵng',
  'Đắk Lắk',
  'Đắk Nông',
  'Điện Biên',
  'Đồng Nai',
  'Đồng Tháp',
  'Gia Lai',
  'Hà Giang',
  'Hà Nam',
  'Hà Nội',
  'Hà Tĩnh',
  'Hải Dương',
  'Hải Phòng',
  'Hậu Giang',
  'Hòa Bình',
  'Hồ Chí Minh',
  'Hưng Yên',
  'Khánh Hòa',
  'Kiên Giang',
  'Kon Tum',
  'Lai Châu',
  'Lâm Đồng',
  'Lạng Sơn',
  'Lào Cai',
  'Long An',
  'Nam Định',
  'Nghệ An',
  'Ninh Bình',
  'Ninh Thuận',
  'Phú Thọ',
  'Phú Yên',
  'Quảng Bình',
  'Quảng Nam',
  'Quảng Ngãi',
  'Quảng Ninh',
  'Quảng Trị',
  'Sóc Trăng',
  'Sơn La',
  'Tây Ninh',
  'Thái Bình',
  'Thái Nguyên',
  'Thanh Hóa',
  'Thừa Thiên Huế',
  'Tiền Giang',
  'Trà Vinh',
  'Tuyên Quang',
  'Vĩnh Long',
  'Vĩnh Phúc',
  'Yên Bái',
] as const;

const EXPLICIT_PROVINCE_PREFIX = /^(?:tỉnh|tinh|thành phố|thanh pho|tp)\.?\s*/i;

function provinceLookupKey(value: string): string {
  return normalizeProvinceLabel(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const PROVINCE_KEYS = new Set([
  ...VIETNAM_PROVINCES_63.map(provinceLookupKey),
  'hcm',
  'tphcm',
  'sg',
  'saigon',
  'han',
  'hanoi',
  'dng',
  'danang',
]);

/**
 * Lấy tỉnh/thành từ địa chỉ nhận.
 * Chỉ nhận tên tỉnh/thành hợp lệ;
 * không coi mọi phần cuối địa chỉ là tỉnh (ví dụ "Thới An" là phường).
 */
export function extractProvinceFromAddress(address?: string | null): string {
  const raw = String(address ?? '').trim();
  if (!raw) return '';

  const parts = raw
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    const normalized = normalizeProvinceLabel(part);
    if (PROVINCE_KEYS.has(provinceLookupKey(normalized))) {
      return normalized;
    }
  }

  return '';
}

export function normalizeProvinceLabel(value: string): string {
  return value
    .replace(EXPLICIT_PROVINCE_PREFIX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Hiển thị tên tỉnh có dấu kể cả khi dữ liệu cũ lưu dạng mã liền như BINHDUONG. */
export function canonicalProvinceLabel(value?: string | null): string {
  const normalized = normalizeProvinceLabel(String(value ?? ''));
  if (!normalized) return '';

  const aliases: Record<string, string> = {
    hcm: 'Hồ Chí Minh',
    tphcm: 'Hồ Chí Minh',
    sg: 'Hồ Chí Minh',
    saigon: 'Hồ Chí Minh',
    han: 'Hà Nội',
    hanoi: 'Hà Nội',
    dng: 'Đà Nẵng',
    danang: 'Đà Nẵng',
    hue: 'Thừa Thiên Huế',
  };
  const key = provinceLookupKey(normalized);
  return aliases[key]
    || VIETNAM_PROVINCES_63.find((province) => provinceLookupKey(province) === key)
    || normalized;
}

export function isHubCode(value?: string | null): boolean {
  const normalized = String(value ?? '').trim().toUpperCase();
  return Boolean(normalized) && HUB_CODES.has(normalized);
}
