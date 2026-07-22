import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

const MAX_BYTES = 5 * 1024 * 1024;
const STORAGE_TIMEOUT_MS = 12_000;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

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

  uploadWaybillImage(file: Express.Multer.File): Promise<string> {
    return this.uploadImage(file, 'waybills');
  }
}
