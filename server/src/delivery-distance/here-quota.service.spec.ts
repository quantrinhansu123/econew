import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { HereQuotaService } from './here-quota.service';

describe('HereQuotaService', () => {
  let values: Record<string, string>;
  let query: jest.Mock;
  let service: HereQuotaService;
  const row = (endpoint: string, overrides = {}) => ({
    endpoint, server_time: new Date('2026-10-18T03:00:00Z'), month: '2026-10', requests_used: 1,
    resets_at: new Date('2026-11-01T00:00:00Z'), minute_used: 1, minute_resets_at: null,
    blocked_until: null, rollover_guard: false, ...overrides,
  });
  beforeEach(() => {
    values = { HERE_ENABLED: 'true', HERE_API_KEY: 'test-secret' };
    query = jest.fn().mockResolvedValue([row('directions'), row('geocoding')]);
    service = new HereQuotaService({ query } as unknown as DataSource, { get: (name: string) => values[name] } as ConfigService);
  });

  it('exposes two independent monthly caps and UTC reset times', async () => {
    expect(await service.getUsage()).toMatchObject({
      provider: 'HERE', month: '2026-10', directions: { used: 1, limit: 30000, remaining: 29999, resets_at: '2026-11-01T00:00:00.000Z' },
      geocoding: { used: 1, limit: 30000, remaining: 29999 },
    });
  });
  it('clamps attempts to raise the monthly limit above the free allowance', async () => {
    values.HERE_ROUTING_MONTHLY_LIMIT = '100000';
    values.HERE_GEOCODING_MONTHLY_LIMIT = '5000';
    expect(await service.getUsage()).toMatchObject({ directions: { limit: 30000 }, geocoding: { limit: 5000 } });
  });
  it.each(['-1', 'NaN', '0', '3.5'])('fails closed on an invalid configured limit: %s', async value => {
    values.HERE_ROUTING_MONTHLY_LIMIT = value;
    await expect(service.getUsage()).rejects.toThrow('Cấu hình hạn mức HERE không hợp lệ');
    expect(query).not.toHaveBeenCalled();
  });
  it('does not reserve without explicit enablement', async () => {
    values.HERE_ENABLED = 'false';
    await expect(service.reserve('directions')).rejects.toThrow('Chưa bật HERE');
    expect(query).not.toHaveBeenCalled();
  });
  it('keeps the same budget after rotating the API key', async () => {
    query.mockResolvedValue([{ month_start: '2026-10-01' }]);
    await service.reserve('directions');
    const firstCall = query.mock.calls[0];
    values.HERE_API_KEY = 'another-secret';
    await service.reserve('directions');
    expect(query.mock.calls[1]).toEqual(firstCall);
    expect(JSON.stringify(query.mock.calls)).not.toContain('secret');
  });
  it('reserves a slot before an outbound call and returns its month', async () => {
    query.mockResolvedValue([{ month_start: '2026-10-01' }]);
    expect(await service.reserve('geocoding')).toBe('2026-10-01');
    expect(query.mock.calls[0][1]).toEqual(['geocoding', 30000, 60, '', 0]);
  });
  it('blocks an exhausted atomic reservation', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([row('directions', { requests_used: 30000 }), row('geocoding')]);
    await expect(service.reserve('directions')).rejects.toMatchObject({ status: 429,
      response: { usage: { directions: { used: 30000, remaining: 0 } } } });
  });
  it('does not turn database failures into successful reservations', async () => {
    query.mockRejectedValue(new Error('database unavailable'));
    await expect(service.reserve('directions')).rejects.toThrow('database unavailable');
  });
  it('blocks the final minute of a UTC month', async () => {
    query.mockResolvedValue([row('directions', { rollover_guard: true }), row('geocoding', { rollover_guard: true })]);
    const usage = await service.getUsage();
    expect(usage.directions).toMatchObject({ blocked: true, blocked_until: '2026-11-01T00:00:00.000Z' });
  });
  it('retains prior usage and validates its seed month', async () => {
    values.HERE_ROUTING_INITIAL_USED = '900';
    await expect(service.getUsage()).rejects.toThrow('Cấu hình hạn mức HERE không hợp lệ');
    values.HERE_INITIAL_USAGE_MONTH = '2026-10';
    await service.getUsage();
    expect(query.mock.calls[0][1]).toEqual(['2026-10', 900, 0]);
  });
  it('keeps Retry-After attached to the reserved month even if a response arrives in a new month', async () => {
    await service.recordResponse('directions', '2026-10-01', new Response('', { status: 429, headers: { 'Retry-After': '120' } }));
    expect(query.mock.calls[0][1].slice(0, 2)).toEqual(['directions', '2026-10-01']);
    expect(Date.parse(query.mock.calls[0][1][2])).toBeGreaterThan(Date.now() + 115000);
  });
});
