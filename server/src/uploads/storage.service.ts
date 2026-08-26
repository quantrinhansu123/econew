import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PRICE_LIST_BYTES = 10 * 1024 * 1024;
const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;
const STORAGE_TIMEOUT_MS = 12_000;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const PRICE_LIST_MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const PRICE_LIST_EXTENSIONS = new Set(Object.values(PRICE_LIST_MIME_EXT));

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly configService: ConfigService) {}

  private cleanEnvValue(value?: string): string {
    const trimmed = value?.trim() || '';
    const wrapped = trimmed.match(/^(['"])([\s\S]*)\1$/);
    return (wrapped?.[2] || trimmed).trim();
  }

  private get supabaseUrl(): string {
    const url = this.cleanEnvValue(this.configService.get<string>('SUPABASE_URL'));
    if (!url) throw new InternalServerErrorException('SUPABASE_URL chưa được cấu hình trên server.');
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !parsed.hostname) throw new Error('invalid protocol or host');
      return parsed.origin;
    } catch {
      throw new InternalServerErrorException('SUPABASE_URL trên server không hợp lệ.');
    }
  }

  private get serverKeys(): string[] {
    const keys = [
      this.cleanEnvValue(this.configService.get<string>('SUPABASE_SECRET_KEY')),
      this.cleanEnvValue(this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')),
    ].filter(Boolean);
    const uniqueKeys = [...new Set(keys)];
    if (!uniqueKeys.length) {
      throw new InternalServerErrorException(
        'SUPABASE_SECRET_KEY hoặc SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình trên server.',
      );
    }
    return uniqueKeys;
  }

  private get bucket(): string {
    const bucket = this.cleanEnvValue(this.configService.get<string>('SUPABASE_STORAGE_BUCKET')) || 'payment-proofs';
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(bucket)) {
      throw new InternalServerErrorException('SUPABASE_STORAGE_BUCKET trên server không hợp lệ.');
    }
    return bucket;
  }

  private authHeaders(key: string, extra: Record<string, string> = {}): Record<string, string> {
    const isLegacyJwt = key.split('.').length === 3;
    return {
      apikey: key,
      ...(isLegacyJwt ? { Authorization: `Bearer ${key}` } : {}),
      ...extra,
    };
  }

  private async storageFetch(
    url: string,
    init: RequestInit,
    operation: string,
  ): Promise<Response> {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), STORAGE_TIMEOUT_MS);
    try {
      return await fetch(url, {
        ...init,
        signal: init.signal ?? timeoutController.signal,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Supabase Storage ${operation} network error: ${detail}`);
      throw new InternalServerErrorException('Không kết nối được Supabase Storage.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async uploadImage(file: Express.Multer.File, folder: string): Promise<string> {
    if (!file?.buffer?.length) throw new BadRequestException('Thiếu file ảnh.');
    if (file.size > MAX_BYTES) throw new BadRequestException('Ảnh tối đa 5 MB.');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc GIF.');
    }

    const ext = MIME_EXT[file.mimetype] ?? 'jpg';
    return this.storeObject(file, folder, ext);
  }

  private async storeObject(file: Express.Multer.File, folder: string, ext: string): Promise<string> {
    const objectPath = `${folder}/${Date.now()}-${randomBytes(8).toString('hex')}.${ext}`;
    const uploadUrl = `${this.supabaseUrl}/storage/v1/object/${this.bucket}/${objectPath}`;
    const serverKeys = this.serverKeys;

    for (const [index, key] of serverKeys.entries()) {
      const uploadResponse = await this.storageFetch(
        uploadUrl,
        {
          method: 'POST',
          headers: this.authHeaders(key, {
            'Content-Type': file.mimetype,
            'x-upsert': 'true',
          }),
          body: new Uint8Array(file.buffer),
        },
        'upload object',
      );

      if (uploadResponse.ok) {
        return `${this.supabaseUrl}/storage/v1/object/public/${this.bucket}/${objectPath}`;
      }

      const detail = await uploadResponse.text();
      this.logger.error(`Supabase Storage upload object failed: ${uploadResponse.status} ${detail}`);
      if (uploadResponse.status === 401 || uploadResponse.status === 403) {
        if (index < serverKeys.length - 1) continue;
        throw new InternalServerErrorException(
          'Khóa Supabase Storage trên server không hợp lệ hoặc không đủ quyền.',
        );
      }
      if (uploadResponse.status === 404 && /bucket/i.test(detail)) {
        throw new InternalServerErrorException(`Không tìm thấy bucket "${this.bucket}" trên Supabase Storage.`);
      }
      throw new InternalServerErrorException('Không upload được ảnh lên Supabase Storage.');
    }

    throw new InternalServerErrorException(
      'Khóa Supabase Storage trên server không hợp lệ hoặc không đủ quyền.',
    );
  }

  uploadPaymentProof(file: Express.Multer.File): Promise<string> {
    return this.uploadImage(file, 'vendor-payments');
  }

  uploadExpenseReceipt(file: Express.Multer.File): Promise<string> {
    return this.uploadImage(file, 'expense-receipts');
  }

  uploadWaybillImage(file: Express.Multer.File): Promise<string> {
    return this.uploadImage(file, 'waybills');
  }

  uploadVendorQrImage(file: Express.Multer.File, vendorCode: string): Promise<string> {
    const normalizedCode = vendorCode?.trim().toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
    if (!normalizedCode) throw new BadRequestException('Nhập mã NCC trước khi tải ảnh QR.');
    return this.uploadImage(file, `vendor-qr/${normalizedCode}`);
  }

  async uploadCustomerPriceList(file: Express.Multer.File, customerCode: string): Promise<string> {
    if (!file?.buffer?.length) throw new BadRequestException('Thiếu file bảng giá.');
    if (file.size > MAX_PRICE_LIST_BYTES) throw new BadRequestException('File bảng giá tối đa 10 MB.');

    const normalizedCustomerCode = customerCode?.trim().toUpperCase() || '';
    if (!normalizedCustomerCode) throw new BadRequestException('Thiếu mã khách hàng của bảng giá.');
    const customerFolder = normalizedCustomerCode
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
    if (!customerFolder) throw new BadRequestException('Mã khách hàng không hợp lệ.');

    const nameExt = file.originalname?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || '';
    const mimeExt = PRICE_LIST_MIME_EXT[file.mimetype];
    const ext = mimeExt || (PRICE_LIST_EXTENSIONS.has(nameExt) ? nameExt : '');
    if (!ext) {
      throw new BadRequestException('Chỉ chấp nhận bảng giá PDF hoặc ảnh JPG, PNG, WebP.');
    }

    return this.storeObject(file, `customer-price-lists/${customerFolder}`, ext);
  }

  async uploadWaybillDimensionFile(file: Express.Multer.File): Promise<string> {
    if (!file?.buffer?.length) throw new BadRequestException('Thiếu file quy đổi kích thước.');
    if (file.size > MAX_SPREADSHEET_BYTES) throw new BadRequestException('File quy đổi tối đa 10 MB.');
    const nameExt = file.originalname?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || '';
    const allowed = new Set(['xlsx', 'xls']);
    if (!allowed.has(nameExt)) throw new BadRequestException('Chỉ chấp nhận file Excel .xlsx hoặc .xls.');
    return this.storeObject(file, 'waybill-dimensions', nameExt);
  }
}
