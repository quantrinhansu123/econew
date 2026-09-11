import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import sharp = require('sharp');
import type { Metadata } from 'sharp';

const sharpFactory = ((sharp as unknown as { default?: unknown }).default ?? sharp) as unknown as (input?: Buffer, options?: Record<string, unknown>) => any;

export const MAX_IMAGE_INPUT_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_OUTPUT_BYTES = 3 * 1024 * 1024;
export const MAX_RAW_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 2_400;
export const MAX_IMAGE_PIXELS = 40_000_000;

const IMAGE_MIME_EXTENSIONS: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'image/avif': ['avif'],
  'image/heic': ['heic'],
  'image/heif': ['heif'],
};

const normalizeMime = (mime: string | undefined): string => (mime || '').trim().toLowerCase() === 'image/jpg'
  ? 'image/jpeg'
  : (mime || '').trim().toLowerCase();

const extensionOf = (name: string | undefined): string => name?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || '';

export const detectImageMime = (buffer: Buffer): string | null => {
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
    if (['avif', 'avis'].includes(brand)) return 'image/avif';
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return brand.startsWith('he') ? 'image/heic' : 'image/heif';
  }
  return null;
};

const ensureImageIdentity = (file: Express.Multer.File): string => {
  if (!file?.buffer?.length) throw new BadRequestException('Thiếu file ảnh.');
  if (file.buffer.length > MAX_IMAGE_INPUT_BYTES) throw new BadRequestException('Ảnh gốc tối đa 10 MB.');
  const declaredMime = normalizeMime(file.mimetype);
  const detectedMime = detectImageMime(file.buffer);
  if (!detectedMime) throw new BadRequestException('Nội dung file không phải ảnh hợp lệ.');
  if (declaredMime && declaredMime !== detectedMime) {
    const compatibleHeif = declaredMime === 'image/heif' && detectedMime === 'image/heic';
    if (!compatibleHeif) throw new BadRequestException('Kiểu file ảnh không khớp với nội dung thực tế.');
  }
  const extension = extensionOf(file.originalname);
  if (extension) {
    const allowedExtensions = IMAGE_MIME_EXTENSIONS[detectedMime] || [];
    const compatibleHeif = detectedMime === 'image/heic' && extension === 'heif';
    if (!allowedExtensions.includes(extension) && !compatibleHeif) {
      throw new BadRequestException('Đuôi file ảnh không khớp với nội dung thực tế.');
    }
  }
  return detectedMime;
};

export type PreparedUpload = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
  digest: string;
};

export async function prepareImage(file: Express.Multer.File): Promise<PreparedUpload> {
  const detectedMime = ensureImageIdentity(file);
  let metadata: Metadata;
  try {
    metadata = await sharpFactory(file.buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' }).metadata();
  } catch {
    throw new BadRequestException('Không đọc được ảnh; file có thể bị hỏng hoặc không được hỗ trợ.');
  }
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (!width || !height || width * height > MAX_IMAGE_PIXELS) {
    throw new BadRequestException('Ảnh có kích thước điểm ảnh vượt giới hạn an toàn.');
  }

  let output: Buffer;
  try {
    output = await sharpFactory(file.buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: detectedMime === 'image/gif' ? 86 : 84, effort: 4, smartSubsample: true })
      .toBuffer();
  } catch {
    throw new BadRequestException('Không thể tối ưu ảnh đã tải lên.');
  }

  if (output.length > MAX_IMAGE_OUTPUT_BYTES) {
    try {
      output = await sharpFactory(file.buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' })
        .rotate()
        .resize({ width: 1_800, height: 1_800, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 76, effort: 5, smartSubsample: true })
        .toBuffer();
    } catch {
      throw new BadRequestException('Không thể nén ảnh xuống giới hạn lưu trữ.');
    }
  }
  if (output.length > MAX_IMAGE_OUTPUT_BYTES) {
    throw new BadRequestException('Ảnh sau nén vẫn vượt 3 MB; vui lòng chọn ảnh có độ phân giải nhỏ hơn.');
  }
  const baseName = file.originalname?.replace(/\.[^.]+$/, '') || 'image';
  return {
    buffer: output,
    mimetype: 'image/webp',
    originalname: `${baseName}.webp`,
    size: output.length,
    digest: createHash('sha256').update(output).digest('hex'),
  };
}

const RAW_SIGNATURES: Record<string, (buffer: Buffer) => boolean> = {
  pdf: (buffer) => buffer.subarray(0, 5).toString('ascii') === '%PDF-',
  xlsx: (buffer) => buffer.length >= 4 && buffer.subarray(0, 2).toString('binary') === 'PK',
  xls: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
};

const RAW_MIME_TYPES: Record<string, string[]> = {
  pdf: ['application/pdf'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  xls: ['application/vnd.ms-excel'],
};

export function prepareRawFile(file: Express.Multer.File, allowedExtensions: Set<string>, label: string): PreparedUpload {
  if (!file?.buffer?.length) throw new BadRequestException(`Thiếu ${label}.`);
  if (file.buffer.length > MAX_RAW_FILE_BYTES) throw new BadRequestException(`${label} tối đa 10 MB.`);
  const extension = extensionOf(file.originalname);
  if (!allowedExtensions.has(extension)) throw new BadRequestException(`Định dạng ${label} không được hỗ trợ.`);
  const declaredMime = (file.mimetype || '').trim().toLowerCase();
  const allowedMimes = RAW_MIME_TYPES[extension] || [];
  if (declaredMime && declaredMime !== 'application/octet-stream' && !allowedMimes.includes(declaredMime)) {
    throw new BadRequestException('Kiểu file không khớp với nội dung và đuôi file.');
  }
  const signature = RAW_SIGNATURES[extension];
  if (!signature || !signature(file.buffer)) throw new BadRequestException(`Nội dung ${label} không hợp lệ.`);
  return {
    buffer: file.buffer,
    mimetype: file.mimetype || 'application/octet-stream',
    originalname: file.originalname || `upload.${extension}`,
    size: file.buffer.length,
    digest: createHash('sha256').update(file.buffer).digest('hex'),
  };
}
