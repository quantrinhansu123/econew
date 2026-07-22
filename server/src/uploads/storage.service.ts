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

const hasBytes = (buffer: Buffer, offset: number, expected: number[]) => (
  expected.every((value, index) => buffer[offset + index] === value)
);

const detectImageMime = (buffer: Buffer): string | null => {
  if (hasBytes(buffer, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (hasBytes(buffer, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  const gifHeader = buffer.subarray(0, 6).toString('ascii');
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') return 'image/gif';
  if (
    hasBytes(buffer, 0, [0x52, 0x49, 0x46, 0x46])
    && hasBytes(buffer, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return 'image/webp';
  }
  return null;
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

    const buckets = (await listResponse.json()) as Array<{
      name?: string;
      id?: string;
      public?: boolean;
    }>;
    const existingBucket = buckets.find(
      (item) => item.name === this.bucket || item.id === this.bucket,
    );
    if (!existingBucket) {
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
    } else if (existingBucket.public !== true) {
      const bucketId = existingBucket.id || this.bucket;
      const updateResponse = await this.storageFetch(
        `${this.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(bucketId)}`,
        {
          method: 'PUT',
          headers: this.authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            id: bucketId,
            name: existingBucket.name || this.bucket,
            public: true,
          }),
        },
        'make bucket public',
      );
      if (!updateResponse.ok) {
        const detail = await updateResponse.text();
        this.logger.error(
          `Supabase Storage make bucket public failed: ${updateResponse.status} ${detail}`,
        );
        if (updateResponse.status === 401 || updateResponse.status === 403) {
          this.throwStorageResponseError(
            'make bucket public',
            updateResponse.status,
            detail,
          );
        }
        throw new InternalServerErrorException(
          `Bucket "${this.bucket}" đang ở chế độ private và không thể chuyển sang public.`,
        );
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
    if (file.size > MAX_BYTES || file.buffer.length > MAX_BYTES) {
      throw new BadRequestException('Ảnh tối đa 5 MB.');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc GIF.');
    }
    if (detectImageMime(file.buffer) !== file.mimetype) {
      throw new BadRequestException('Nội dung file không khớp định dạng ảnh đã khai báo.');
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

  private waybillObjectPath(publicUrl: string): string | null {
    let candidate: URL;
    try {
      candidate = new URL(publicUrl);
    } catch {
      return null;
    }

    const storageRoot = new URL(this.supabaseUrl);
    const rootPath = storageRoot.pathname.replace(/\/+$/, '');
    const expectedPrefix = `${rootPath}/storage/v1/object/public/${this.bucket}/`;
    if (
      candidate.origin !== storageRoot.origin
      || candidate.search
      || candidate.hash
      || !candidate.pathname.startsWith(expectedPrefix)
    ) {
      return null;
    }

    try {
      const objectPath = decodeURIComponent(candidate.pathname.slice(expectedPrefix.length));
      return /^waybills\/[^/]+\.(?:jpe?g|png|webp|gif)$/i.test(objectPath)
        ? objectPath
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Kiểm tra metadata trực tiếp trong Storage thay vì tin URL do client gửi lên.
   * DELIVERED phải bị chặn nếu object đã bị xóa hoặc URL chỉ đúng về hình thức.
   */
  async assertWaybillImagesExist(publicUrls: string[]): Promise<void> {
    const objectPaths = publicUrls.map((publicUrl) => this.waybillObjectPath(publicUrl));
    if (objectPaths.some((objectPath) => !objectPath)) {
      throw new BadRequestException('Ảnh giao hàng phải được upload bằng hệ thống.');
    }

    await Promise.all(objectPaths.map(async (objectPath) => {
      const encodedPath = objectPath!
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      const response = await this.storageFetch(
        `${this.supabaseUrl}/storage/v1/object/info/${encodeURIComponent(this.bucket)}/${encodedPath}`,
        { headers: this.authHeaders() },
        'read waybill object metadata',
      );

      if (response.ok) return;

      const detail = await response.text();
      if (response.status === 400 || response.status === 404) {
        this.logger.warn(`Supabase Storage waybill object missing: ${response.status} ${objectPath}`);
        throw new BadRequestException('Ảnh giao hàng không tồn tại trên Storage. Vui lòng upload lại.');
      }
      this.throwStorageResponseError('read waybill object metadata', response.status, detail);
    }));
  }

  uploadPaymentProof(file: Express.Multer.File): Promise<string> {
    return this.uploadImage(file, 'vendor-payments');
  }

  uploadWaybillImage(file: Express.Multer.File): Promise<string> {
    return this.uploadImage(file, 'waybills');
  }
}
