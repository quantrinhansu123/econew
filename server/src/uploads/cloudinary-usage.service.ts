import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type UsageSnapshot = {
  used: number;
  limit: number;
  fetchedAt: number;
};

type CloudinaryUsageResponse = {
  credits?: { usage?: unknown; limit?: unknown };
};

const DEFAULT_CREDIT_LIMIT = 25;
const DEFAULT_CUTOFF = 24;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RATE_PER_MINUTE = 30;
const DEFAULT_MAX_CONCURRENCY = 3;

const numberFromConfig = (config: ConfigService, key: string, fallback: number): number => {
  const value = Number(config.get<string | number>(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const asFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

@Injectable()
export class CloudinaryUsageService {
  private readonly logger = new Logger(CloudinaryUsageService.name);
  private cachedSnapshot: UsageSnapshot | null = null;
  private refreshPromise: Promise<UsageSnapshot> | null = null;
  private readonly requestTimestamps: number[] = [];
  private inFlightUploads = 0;

  constructor(private readonly configService: ConfigService) {}

  private cleanEnvValue(value?: string): string {
    const trimmed = value?.trim() || '';
    const wrapped = trimmed.match(/^(['"])([\s\S]*)\1$/);
    return (wrapped?.[2] || trimmed).trim();
  }

  private get cloudName(): string {
    const value = this.cleanEnvValue(this.configService.get<string>('CLOUDINARY_CLOUD_NAME'));
    if (!value) throw new ServiceUnavailableException('Chưa cấu hình Cloudinary để kiểm tra hạn mức lưu trữ.');
    if (!/^[a-z0-9_-]+$/i.test(value)) throw new ServiceUnavailableException('CLOUDINARY_CLOUD_NAME trên server không hợp lệ.');
    return value;
  }

  private get apiKey(): string {
    const value = this.cleanEnvValue(this.configService.get<string>('CLOUDINARY_API_KEY'));
    if (!value) throw new ServiceUnavailableException('Chưa cấu hình Cloudinary để kiểm tra hạn mức lưu trữ.');
    return value;
  }

  private get apiSecret(): string {
    const value = this.cleanEnvValue(this.configService.get<string>('CLOUDINARY_API_SECRET'));
    if (!value) throw new ServiceUnavailableException('Chưa cấu hình Cloudinary để kiểm tra hạn mức lưu trữ.');
    return value;
  }

  private get cacheTtlMs(): number {
    return numberFromConfig(this.configService, 'CLOUDINARY_USAGE_CACHE_TTL_MS', DEFAULT_CACHE_TTL_MS);
  }

  private get timeoutMs(): number {
    return numberFromConfig(this.configService, 'CLOUDINARY_USAGE_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
  }

  private get creditLimit(): number {
    return numberFromConfig(this.configService, 'CLOUDINARY_CREDIT_LIMIT', DEFAULT_CREDIT_LIMIT);
  }

  private get creditCutoff(): number {
    const configured = numberFromConfig(this.configService, 'CLOUDINARY_CREDIT_CUTOFF', DEFAULT_CUTOFF);
    return Math.min(configured, this.creditLimit);
  }

  private get ratePerMinute(): number {
    return Math.max(1, Math.floor(numberFromConfig(this.configService, 'CLOUDINARY_UPLOAD_RATE_PER_MINUTE', DEFAULT_RATE_PER_MINUTE)));
  }

  private get maxConcurrency(): number {
    return Math.max(1, Math.floor(numberFromConfig(this.configService, 'CLOUDINARY_UPLOAD_MAX_CONCURRENCY', DEFAULT_MAX_CONCURRENCY)));
  }

  private async fetchUsage(): Promise<UsageSnapshot> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const auth = Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64');
    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/usage`, {
        headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as CloudinaryUsageResponse | null;
      if (!response.ok) {
        throw new Error(`Cloudinary Usage API HTTP ${response.status}`);
      }
      const used = asFiniteNumber(payload?.credits?.usage);
      const configuredLimit = this.creditLimit;
      const limit = asFiniteNumber(payload?.credits?.limit) ?? configuredLimit;
      if (used === null || limit <= 0) throw new Error('Cloudinary Usage API không trả về credits hợp lệ.');
      return { used, limit, fetchedAt: Date.now() };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Không đọc được Cloudinary Usage API: ${detail}`);
      throw new ServiceUnavailableException('Không kiểm tra được hạn mức Cloudinary; upload đã được tạm dừng để bảo vệ gói dịch vụ.');
    } finally {
      clearTimeout(timeout);
    }
  }

  async getUsage(forceRefresh = false): Promise<UsageSnapshot> {
    const now = Date.now();
    if (!forceRefresh && this.cachedSnapshot && now - this.cachedSnapshot.fetchedAt < this.cacheTtlMs) {
      return this.cachedSnapshot;
    }
    if (!this.refreshPromise) {
      this.refreshPromise = this.fetchUsage()
        .then((snapshot) => {
          this.cachedSnapshot = snapshot;
          return snapshot;
        })
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    return this.refreshPromise;
  }

  async assertUploadAllowed(): Promise<UsageSnapshot> {
    const usage = await this.getUsage();
    const cutoff = Math.min(this.creditCutoff, usage.limit);
    if (usage.used >= cutoff) {
      throw new HttpException(
        `Cloudinary đã dùng ${usage.used.toFixed(2)}/${usage.limit.toFixed(2)} credits; upload tạm dừng để bảo vệ hạn mức.`,
        507,
      );
    }
    return usage;
  }

  async acquireUploadPermit(): Promise<() => void> {
    await this.assertUploadAllowed();
    const now = Date.now();
    while (this.requestTimestamps[0] !== undefined && now - this.requestTimestamps[0] >= 60_000) {
      this.requestTimestamps.shift();
    }
    if (this.requestTimestamps.length >= this.ratePerMinute) {
      throw new HttpException('Cloudinary đang nhận quá nhiều lượt upload; vui lòng thử lại sau.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (this.inFlightUploads >= this.maxConcurrency) {
      throw new HttpException('Cloudinary đang xử lý đủ số lượt upload đồng thời; vui lòng thử lại sau.', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.requestTimestamps.push(now);
    this.inFlightUploads += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inFlightUploads = Math.max(0, this.inFlightUploads - 1);
    };
  }
}
