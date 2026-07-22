import { BadRequestException } from '@nestjs/common';

export const MAX_WAYBILL_PHOTOS = 4;

const WAYBILL_IMAGE_EXTENSIONS = '(?:jpe?g|png|webp|gif)';
const LEGACY_IMAGE_PATH = new RegExp(`\\.${WAYBILL_IMAGE_EXTENSIONS}$`, 'i');
const UPLOADED_WAYBILL_OBJECT = new RegExp(
  `^\\d{13}-[a-f0-9]{16}\\.${WAYBILL_IMAGE_EXTENSIONS}$`,
  'i',
);

export interface WaybillPhotoValidationOptions {
  supabaseUrl?: string | null;
  storageBucket?: string | null;
  /** Only for validating already-persisted pre-hardening data. */
  allowLegacyExternalUrls?: boolean;
}

export function parseWaybillPhotos(value?: string | null): string[] {
  if (!value?.trim()) return [];
  return [...new Set(
    value
      .split(/[|\n]/)
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function safeDecodePath(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function isConfiguredUploadUrl(
  candidate: URL,
  options: WaybillPhotoValidationOptions,
): boolean {
  const configuredUrl = options.supabaseUrl?.trim();
  if (!configuredUrl) return false;

  let storageRoot: URL;
  try {
    storageRoot = new URL(configuredUrl);
  } catch {
    return false;
  }

  if (candidate.origin !== storageRoot.origin) return false;
  if (candidate.username || candidate.password || candidate.search || candidate.hash) return false;
  if (candidate.protocol !== 'https:' && candidate.protocol !== storageRoot.protocol) return false;

  const bucket = options.storageBucket?.trim() || 'payment-proofs';
  const rootPath = storageRoot.pathname.replace(/\/+$/, '');
  const expectedPrefix = `${rootPath}/storage/v1/object/public/${bucket}/waybills/`;
  if (!candidate.pathname.startsWith(expectedPrefix)) return false;

  const objectName = safeDecodePath(candidate.pathname.slice(expectedPrefix.length));
  return objectName != null
    && !objectName.includes('/')
    && UPLOADED_WAYBILL_OBJECT.test(objectName);
}

function isLegacyExternalImageUrl(candidate: URL): boolean {
  if (candidate.protocol !== 'https:' || candidate.username || candidate.password || candidate.hash) {
    return false;
  }
  const decodedPath = safeDecodePath(candidate.pathname);
  return decodedPath != null && LEGACY_IMAGE_PATH.test(decodedPath);
}

export function isValidWaybillPhotoUrl(
  value: string,
  options: WaybillPhotoValidationOptions = {},
): boolean {
  if (!value || value !== value.trim() || value.length > 3_000 || /\s/.test(value)) return false;

  let candidate: URL;
  try {
    candidate = new URL(value);
  } catch {
    return false;
  }

  if (isConfiguredUploadUrl(candidate, options)) return true;
  return options.allowLegacyExternalUrls !== false && isLegacyExternalImageUrl(candidate);
}

export function normalizeWaybillPhotos(
  value?: string | null,
  options: WaybillPhotoValidationOptions = {},
): string | null {
  if (typeof value === 'string' && !value.trim()) {
    throw new BadRequestException('Ảnh vận đơn không được để trống. Dùng null để xóa ảnh.');
  }
  const photos = parseWaybillPhotos(value);
  if (photos.length > MAX_WAYBILL_PHOTOS) {
    throw new BadRequestException(`Mỗi vận đơn chỉ được gắn tối đa ${MAX_WAYBILL_PHOTOS} ảnh.`);
  }
  if (photos.some((photo) => !isValidWaybillPhotoUrl(photo, options))) {
    throw new BadRequestException('Ảnh vận đơn phải là URL ảnh đã upload hợp lệ.');
  }
  return photos.length ? photos.join('|') : null;
}

export function hasValidWaybillPhotos(
  value: string | null | undefined,
  options: WaybillPhotoValidationOptions = {},
): boolean {
  try {
    return normalizeWaybillPhotos(value, options) !== null;
  } catch {
    return false;
  }
}
