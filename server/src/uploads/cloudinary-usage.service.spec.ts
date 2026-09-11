import { HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudinaryUsageService } from './cloudinary-usage.service';

const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('CloudinaryUsageService', () => {
  let config: Record<string, string>;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  const createService = () => new CloudinaryUsageService({ get: jest.fn((key: string) => config[key]) } as unknown as ConfigService);

  beforeEach(() => {
    config = {
      CLOUDINARY_CLOUD_NAME: 'eco-cloud',
      CLOUDINARY_API_KEY: '123456',
      CLOUDINARY_API_SECRET: 'server-secret',
      CLOUDINARY_CREDIT_LIMIT: '25',
      CLOUDINARY_CREDIT_CUTOFF: '24',
      CLOUDINARY_USAGE_CACHE_TTL_MS: '60000',
      CLOUDINARY_UPLOAD_RATE_PER_MINUTE: '30',
      CLOUDINARY_UPLOAD_MAX_CONCURRENCY: '3',
    };
    fetchMock = jest.spyOn(global, 'fetch');
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('caches usage and coalesces concurrent refreshes', async () => {
    let resolveResponse: ((value: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    fetchMock.mockReturnValueOnce(pending);
    const service = createService();
    const first = service.getUsage();
    const second = service.getUsage();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveResponse?.(response(200, { credits: { usage: 2.25, limit: 25 } }));
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ used: 2.25, limit: 25 }),
      expect.objectContaining({ used: 2.25, limit: 25 }),
    ]);
    await service.getUsage();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops uploads before the configured cutoff', async () => {
    fetchMock.mockResolvedValueOnce(response(200, { credits: { usage: 24.1, limit: 25 } }));
    const service = createService();
    await expect(service.assertUploadAllowed()).rejects.toThrow('upload tạm dừng');
    const error = await service.assertUploadAllowed().catch((value) => value) as HttpException;
    expect(error).toBeInstanceOf(HttpException);
  });

  it('fails closed when the Usage API is unavailable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(createService().assertUploadAllowed()).rejects.toThrow('upload đã được tạm dừng');
  });

  it('enforces per-instance upload concurrency and releases permits', async () => {
    config.CLOUDINARY_UPLOAD_MAX_CONCURRENCY = '1';
    fetchMock.mockResolvedValueOnce(response(200, { credits: { usage: 1, limit: 25 } }));
    const service = createService();
    const release = await service.acquireUploadPermit();
    await expect(service.acquireUploadPermit()).rejects.toThrow('đồng thời');
    release();
    const next = await service.acquireUploadPermit();
    next();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
