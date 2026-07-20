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
  private bucketReadyPromise: Promise<void> | null = null;

  constructor(private readonly configService: ConfigService) {}

  private get supabaseUrl(): string {
    const url = this.configService.get<string>('SUPABASE_URL')?.trim();
    if (!url) throw new InternalServerErrorException('SUPABASE_URL chưa được cấu hình trên server.');
    return url.replace(/\/$/, '');
  }

  private get serverKey(): string {
    const key =
      this.configService.get<string>('SUPABASE_SECRET_KEY')?.trim()
      || this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.trim();
    if (!key) {
      throw new InternalServerErrorException(
        'SUPABASE_SECRET_KEY hoặc SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình trên server.',
      );
    }
    return key;
  }

  private get bucket(): string {
    return this.configService.get<string>('SUPABASE_STORAGE_BUCKET')?.trim() || 'payment-proofs';
  }

  private authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const key = this.serverKey;
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

  private throwStorageResponseError(
    operation: string,
    status: number,
    detail: string,
  ): never {
    this.logger.error(`Supabase Storage ${operation} failed: ${status} ${detail}`);
    if (status === 401 || status === 403) {
      throw new InternalServerErrorException(
        'Khóa Supabase Storage trên server không hợp lệ hoặc không đủ quyền.',
      );
    }
    throw new InternalServerErrorException('Không kết nối được Supabase Storage.');
  }

  private async initializeBucket(): Promise<void> {
    const listResponse = await this.storageFetch(
      `${this.supabaseUrl}/storage/v1/bucket`,
      { headers: this.authHeaders() },
      'list buckets',
    );
    if (!listResponse.ok) {
      const detail = await listResponse.text();
      this.throwStorageResponseError('list buckets', listResponse.status, detail);
    }

    const buckets = (await listResponse.json()) as Array<{ name?: string; id?: string }>;
    const exists = buckets.some((item) => item.name === this.bucket || item.id === this.bucket);
    if (!exists) {
      const createResponse = await this.storageFetch(
        `${this.supabaseUrl}/storage/v1/bucket`,
        {
          method: 'POST',
          headers: this.authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ id: this.bucket, name: this.bucket, public: true }),
        },
        'create bucket',
      );
      if (!createResponse.ok) {
        const detail = await createResponse.text();
        const isCreateConflict =
          createResponse.status === 409
          || /\b(already exists|conflict|duplicate)\b/i.test(detail);
        if (isCreateConflict) {
          this.logger.warn(`Supabase Storage bucket "${this.bucket}" đã được tạo đồng thời.`);
        } else {
          this.logger.error(`Supabase Storage create bucket failed: ${createResponse.status} ${detail}`);
          throw new InternalServerErrorException(`Không tạo được bucket "${this.bucket}" trên Supabase.`);
        }
      }
    }
  }

  private ensureBucket(): Promise<void> {
    this.bucketReadyPromise ??= this.initializeBucket().catch((error: unknown) => {
      this.bucketReadyPromise = null;
      throw error;
    });
    return this.bucketReadyPromise;
  }

  private async uploadImage(file: Express.Multer.File, folder: string): Promise<string> {
    if (!file?.buffer?.length) throw new BadRequestException('Thiếu file ảnh.');
    if (file.size > MAX_BYTES) throw new BadRequestException('Ảnh tối đa 5 MB.');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc GIF.');
    }

    await this.ensureBucket();

    const ext = MIME_EXT[file.mimetype] ?? 'jpg';
    const objectPath = `${folder}/${Date.now()}-${randomBytes(8).toString('hex')}.${ext}`;
    const uploadUrl = `${this.supabaseUrl}/storage/v1/object/${this.bucket}/${objectPath}`;

    const uploadResponse = await this.storageFetch(
      uploadUrl,
      {
        method: 'POST',
        headers: this.authHeaders({
          'Content-Type': file.mimetype,
          'x-upsert': 'true',
        }),
        body: new Uint8Array(file.buffer),
      },
      'upload object',
    );

    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text();
      this.logger.error(`Supabase Storage upload object failed: ${uploadResponse.status} ${detail}`);
      if (uploadResponse.status === 401 || uploadResponse.status === 403) {
        throw new InternalServerErrorException(
          'Khóa Supabase Storage trên server không hợp lệ hoặc không đủ quyền.',
        );
      }
      throw new InternalServerErrorException('Không upload được ảnh lên cloud.');
    }

    return `${this.supabaseUrl}/storage/v1/object/public/${this.bucket}/${objectPath}`;
  }

  uploadPaymentProof(file: Express.Multer.File): Promise<string> {
    return this.uploadImage(file, 'vendor-payments');
  }

  uploadWaybillImage(file: Express.Multer.File): Promise<string> {
    return this.uploadImage(file, 'waybills');
  }
}
