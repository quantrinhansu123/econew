import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

export const HERE_FREE_MONTHLY_LIMIT = 30_000;
export const HERE_MINUTE_LIMIT = 60; // Conservative local throttle, not a HERE plan allowance.
export type HereEndpoint = 'directions' | 'geocoding';
export interface HereEndpointUsage {
  used: number;
  limit: number;
  free_limit: number;
  remaining: number;
  resets_at: string;
  minute_used: number;
  minute_limit: number;
  minute_remaining: number;
  minute_resets_at: string | null;
  blocked_until: string | null;
  blocked: boolean;
}
export interface DeliveryDistanceUsage {
  provider: 'HERE';
  configured: boolean;
  observed_at: string;
  month: string;
  directions: HereEndpointUsage;
  geocoding: HereEndpointUsage;
}
interface UsageRow {
  endpoint: HereEndpoint;
  server_time: Date;
  month: string;
  requests_used: number;
  resets_at: Date;
  minute_used: number;
  minute_resets_at: Date | null;
  blocked_until: Date | null;
  rollover_guard: boolean;
}

@Injectable()
export class HereQuotaService {
  constructor(private readonly dataSource: DataSource, private readonly config: ConfigService) {}

  get configured() {
    return this.config.get<string>('HERE_ENABLED') === 'true' && Boolean(this.config.get<string>('HERE_API_KEY')?.trim());
  }

  private settings(endpoint: HereEndpoint) {
    const name = endpoint === 'directions' ? 'ROUTING' : 'GEOCODING';
    const rawLimit = this.config.get<string>(`HERE_${name}_MONTHLY_LIMIT`);
    const limit = rawLimit === undefined || rawLimit === '' ? HERE_FREE_MONTHLY_LIMIT : Number(rawLimit);
    const seedMonth = this.config.get<string>('HERE_INITIAL_USAGE_MONTH') || '';
    const rawUsed = this.config.get<string>(`HERE_${name}_INITIAL_USED`);
    const initialUsed = rawUsed === undefined || rawUsed === '' ? 0 : Number(rawUsed);
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(initialUsed) || initialUsed < 0
      || (seedMonth !== '' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(seedMonth)) || (initialUsed > 0 && !seedMonth)) {
      throw new ServiceUnavailableException('Cấu hình hạn mức HERE không hợp lệ. Tạm dừng tính km.');
    }
    return { limit: Math.min(limit, HERE_FREE_MONTHLY_LIMIT), initialUsed, seedMonth };
  }

  async getUsage(): Promise<DeliveryDistanceUsage> {
    const limits = { directions: this.settings('directions'), geocoding: this.settings('geocoding') };
    const rows: UsageRow[] = await this.dataSource.query(`
      WITH clock AS (SELECT clock_timestamp() AS at), period AS (
        SELECT at, date_trunc('month', at AT TIME ZONE 'UTC')::date AS month_start,
          (date_trunc('month', at AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC' AS resets_at
        FROM clock
      )
      SELECT limits.endpoint, p.at AS server_time, to_char(p.month_start, 'YYYY-MM') AS month,
        GREATEST(COALESCE(u.requests_used, 0), CASE WHEN to_char(p.month_start, 'YYYY-MM') = $1 THEN limits.initial_used ELSE 0 END) AS requests_used,
        p.resets_at,
        CASE WHEN u.minute_started_at > p.at - interval '60 seconds' THEN u.minute_used ELSE 0 END AS minute_used,
        CASE WHEN u.minute_started_at > p.at - interval '60 seconds' THEN u.minute_started_at + interval '60 seconds' END AS minute_resets_at,
        CASE WHEN u.blocked_until > p.at THEN u.blocked_until END AS blocked_until,
        p.resets_at <= p.at + interval '60 seconds' AS rollover_guard
      FROM period p CROSS JOIN (VALUES ('directions', $2::int), ('geocoding', $3::int)) AS limits(endpoint, initial_used)
      LEFT JOIN here_api_usage u ON u.endpoint = limits.endpoint AND u.month_start = p.month_start
    `, [limits.directions.seedMonth, limits.directions.initialUsed, limits.geocoding.initialUsed]);
    if (rows.length !== 2 || !rows.some(row => row.endpoint === 'directions') || !rows.some(row => row.endpoint === 'geocoding')) {
      throw new ServiceUnavailableException('Không đọc được hạn mức HERE. Tạm dừng tính km.');
    }
    const result = Object.fromEntries(rows.map(row => {
      const used = Number(row.requests_used);
      const minuteUsed = Number(row.minute_used);
      if (!Number.isSafeInteger(used) || used < 0 || !Number.isSafeInteger(minuteUsed) || minuteUsed < 0) {
        throw new ServiceUnavailableException('Hạn mức HERE không hợp lệ. Tạm dừng tính km.');
      }
      const limit = limits[row.endpoint].limit;
      const blockedUntil = row.rollover_guard ? row.resets_at : row.blocked_until;
      return [row.endpoint, {
        used, limit, free_limit: HERE_FREE_MONTHLY_LIMIT, remaining: Math.max(0, limit - used),
        resets_at: new Date(row.resets_at).toISOString(),
        minute_used: minuteUsed, minute_limit: HERE_MINUTE_LIMIT, minute_remaining: Math.max(0, HERE_MINUTE_LIMIT - minuteUsed),
        minute_resets_at: row.minute_resets_at ? new Date(row.minute_resets_at).toISOString() : null,
        blocked_until: blockedUntil ? new Date(blockedUntil).toISOString() : null,
        blocked: used >= limit || minuteUsed >= HERE_MINUTE_LIMIT || Boolean(blockedUntil),
      }];
    })) as Pick<DeliveryDistanceUsage, 'directions' | 'geocoding'>;
    return { provider: 'HERE', configured: this.configured, observed_at: new Date(rows[0].server_time).toISOString(), month: rows[0].month, ...result };
  }

  async throwBlocked(endpoint: HereEndpoint): Promise<never> {
    const usage = await this.getUsage();
    const name = endpoint === 'directions' ? 'tính đường ô tô' : 'tìm địa chỉ';
    throw new HttpException({ message: `Đã chạm giới hạn ${name} HERE hoặc đang chờ đặt lại hạn mức. Không gửi thêm yêu cầu.`, usage }, HttpStatus.TOO_MANY_REQUESTS);
  }

  async reserve(endpoint: HereEndpoint): Promise<string> {
    if (!this.configured) throw new ServiceUnavailableException('Chưa bật HERE. Không gửi yêu cầu bản đồ.');
    const settings = this.settings(endpoint);
    // One database-wide budget for each SKU/month, independent of API keys.
    // Commit before outbound I/O. No refunds or automatic retries, even on timeout.
    const rows = await this.dataSource.query(`
      WITH clock AS (SELECT clock_timestamp() AS at), period AS (
        SELECT at, date_trunc('month', at AT TIME ZONE 'UTC')::date AS month_start,
          (date_trunc('month', at AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC' AS resets_at
        FROM clock
      ), budget AS (
        SELECT *, CASE WHEN to_char(month_start, 'YYYY-MM') = $4 THEN $5::int ELSE 0 END AS baseline FROM period
      )
      INSERT INTO here_api_usage (endpoint, month_start, requests_used, minute_used, minute_started_at)
      SELECT $1, month_start, baseline + 1, 1, at FROM budget
      WHERE baseline < $2 AND resets_at > at + interval '60 seconds'
      ON CONFLICT (endpoint, month_start) DO UPDATE SET
        requests_used = GREATEST(here_api_usage.requests_used, EXCLUDED.requests_used - 1) + 1,
        minute_used = CASE WHEN here_api_usage.minute_started_at <= EXCLUDED.minute_started_at - interval '60 seconds' THEN 1 ELSE here_api_usage.minute_used + 1 END,
        minute_started_at = CASE WHEN here_api_usage.minute_started_at <= EXCLUDED.minute_started_at - interval '60 seconds' THEN EXCLUDED.minute_started_at ELSE here_api_usage.minute_started_at END,
        updated_at = EXCLUDED.minute_started_at
      WHERE GREATEST(here_api_usage.requests_used, EXCLUDED.requests_used - 1) < $2
        AND (CASE WHEN here_api_usage.minute_started_at <= EXCLUDED.minute_started_at - interval '60 seconds' THEN 0 ELSE here_api_usage.minute_used END) < $3
        AND (here_api_usage.blocked_until IS NULL OR here_api_usage.blocked_until <= EXCLUDED.minute_started_at)
      RETURNING to_char(month_start, 'YYYY-MM-DD') AS month_start
    `, [endpoint, settings.limit, HERE_MINUTE_LIMIT, settings.seedMonth, settings.initialUsed]);
    if (!rows.length) await this.throwBlocked(endpoint);
    return rows[0].month_start;
  }

  async recordResponse(endpoint: HereEndpoint, monthStart: string, response: Pick<Response, 'headers' | 'status'>) {
    if (response.status !== 429 && response.status !== 401 && response.status !== 403) return;
    const retry = response.headers.get('retry-after');
    const parsed = retry && /^\d+$/.test(retry) ? Date.now() + Number(retry) * 1000 : Date.parse(retry || '');
    const until = new Date(Math.min(Date.now() + 24 * 3600_000, Math.max(Date.now() + 60_000, Number.isFinite(parsed) ? parsed : 0))).toISOString();
    await this.dataSource.query(`UPDATE here_api_usage SET blocked_until = GREATEST(blocked_until, $3::timestamptz)
      WHERE endpoint = $1 AND month_start = $2::date`, [endpoint, monthStart, until]);
  }
}
