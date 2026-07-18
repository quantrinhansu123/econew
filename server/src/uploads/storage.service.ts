import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

const MAX_BYTES = 5 * 1024 * 1024;
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
  private bucketReady = false;

  constructor(private readonly configService: ConfigService) {}

  private get supabaseUrl(): string {
    const url = this.configService.get<string>('SUPABASE_URL')?.trim();
    if (!url) throw new InternalServerErrorException('SUPABASE_URL chưa được cấu hình trên server.');
    return url.replace(/\/$/, '');
  }

  private get serviceKey(): string {
    const key = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.trim();
    if (!key) throw new InternalServerErrorException('SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình trên server.');
    return key;
  }

  private get bucket(): string {
    return this.configService.get<string>('SUPABASE_STORAGE_BUCKET')?.trim() || 'payment-proofs';
  }

  private authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.serviceKey}`,
      apikey: this.serviceKey,
      ...extra,
    };
  }

  private async ensureBucket(): Promise<void> {
    if (this.bucketReady) return;

    const listResponse = await fetch(`${this.supabaseUrl}/storage/v1/bucket`, {
      headers: this.authHeaders(),
    });
    if (!listResponse.ok) {
      const detail = await listResponse.text();
      this.logger.error(`Supabase list buckets failed: ${listResponse.status} ${detail}`);
      throw new InternalServerErrorException('Không kết nối được Supabase Storage.');
    }

    const buckets = (await listResponse.json()) as Array<{ name?: string; id?: string }>;
    const exists = buckets.some((item) => item.name === this.bucket || item.id === this.bucket);
    if (!exists) {
      const createResponse = await fetch(`${this.supabaseUrl}/storage/v1/bucket`, {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: this.bucket, name: this.bucket, public: true }),
      });
      if (!createResponse.ok) {
        const detail = await createResponse.text();
        this.logger.error(`Supabase create bucket failed: ${createResponse.status} ${detail}`);
        throw new InternalServerErrorException(`Không tạo được bucket "${this.bucket}" trên Supabase.`);
      }
    }

    this.bucketReady = true;
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

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: this.authHeaders({
        'Content-Type': file.mimetype,
        'x-upsert': 'true',
      }),
      body: new Uint8Array(file.buffer),
    });

    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text();
      this.logger.error(`Supabase upload failed: ${uploadResponse.status} ${detail}`);
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
