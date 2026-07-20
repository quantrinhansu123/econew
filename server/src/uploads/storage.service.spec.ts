import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

const imageFile = {
  buffer: Buffer.from('image-bytes'),
  mimetype: 'image/jpeg',
  size: 11,
} as Express.Multer.File;

const jsonResponse = (status: number, body: unknown) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: { 'Content-Type': 'application/json' },
  },
);

describe('StorageService', () => {
  let config: Record<string, string>;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  const createService = () => {
    const configService = {
      get: jest.fn((key: string) => config[key]),
    } as unknown as ConfigService;
    return new StorageService(configService);
  };

  beforeEach(() => {
    config = {
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_STORAGE_BUCKET: 'payment-proofs',
    };
    fetchMock = jest.spyOn(global, 'fetch');
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses only the apikey header for a new Supabase secret key', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_server_key';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 'payment-proofs' }]))
      .mockResolvedValueOnce(jsonResponse(200, { Key: 'waybills/photo.jpg' }));

    const url = await createService().uploadWaybillImage(imageFile);

    const listHeaders = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    const uploadHeaders = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;
    expect(listHeaders.apikey).toBe('sb_secret_server_key');
    expect(listHeaders).not.toHaveProperty('Authorization');
    expect(uploadHeaders.apikey).toBe('sb_secret_server_key');
    expect(uploadHeaders).not.toHaveProperty('Authorization');
    expect(url).toMatch(
      /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/public\/payment-proofs\/waybills\/.+\.jpg$/,
    );
  });

  it('recognizes a new secret key even when Render keeps it under the legacy env name', async () => {
    config.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_render_key';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 'payment-proofs' }]))
      .mockResolvedValueOnce(jsonResponse(200, { Key: 'waybills/photo.jpg' }));

    await createService().uploadWaybillImage(imageFile);

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.apikey).toBe('sb_secret_render_key');
    expect(headers).not.toHaveProperty('Authorization');
  });

  it('keeps Bearer authorization for a legacy service-role JWT', async () => {
    config.SUPABASE_SERVICE_ROLE_KEY = 'eyJheader.eyJpayload.signature';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [{ name: 'payment-proofs' }]))
      .mockResolvedValueOnce(jsonResponse(200, { Key: 'waybills/photo.jpg' }));

    await createService().uploadWaybillImage(imageFile);

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.apikey).toBe(config.SUPABASE_SERVICE_ROLE_KEY);
    expect(headers.Authorization).toBe(`Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`);
  });

  it('returns an actionable error when the configured key is rejected', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_invalid';
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: 'Invalid API key' }));

    await expect(createService().uploadWaybillImage(imageFile)).rejects.toThrow(
      'Khóa Supabase Storage trên server không hợp lệ hoặc không đủ quyền.',
    );
  });

  it('maps network failures to the Storage connection error', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_server_key';
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(createService().uploadWaybillImage(imageFile)).rejects.toThrow(
      'Không kết nối được Supabase Storage.',
    );
  });

  it('shares one bucket lookup across concurrent uploads', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_server_key';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 'payment-proofs' }]))
      .mockResolvedValueOnce(jsonResponse(200, { Key: 'waybills/photo-1.jpg' }))
      .mockResolvedValueOnce(jsonResponse(200, { Key: 'vendor-payments/photo-2.jpg' }));

    const service = createService();
    await Promise.all([
      service.uploadWaybillImage(imageFile),
      service.uploadPaymentProof(imageFile),
    ]);

    const bucketLookups = fetchMock.mock.calls.filter(([url, init]) => (
      String(url).endsWith('/storage/v1/bucket') && !init?.method
    ));
    expect(bucketLookups).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('resets bucket initialization after failure so a later upload can retry', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_server_key';
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const service = createService();
    await expect(service.uploadWaybillImage(imageFile)).rejects.toThrow(
      'Không kết nối được Supabase Storage.',
    );

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 'payment-proofs' }]))
      .mockResolvedValueOnce(jsonResponse(200, { Key: 'waybills/photo.jpg' }));
    await expect(service.uploadWaybillImage(imageFile)).resolves.toContain('/waybills/');

    const bucketLookups = fetchMock.mock.calls.filter(([url, init]) => (
      String(url).endsWith('/storage/v1/bucket') && !init?.method
    ));
    expect(bucketLookups).toHaveLength(2);
  });

  it('accepts a create-bucket conflict caused by another server instance', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_server_key';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(jsonResponse(409, { message: 'The resource already exists' }))
      .mockResolvedValueOnce(jsonResponse(200, { Key: 'waybills/photo.jpg' }));

    await expect(createService().uploadWaybillImage(imageFile)).resolves.toContain('/waybills/');
  });
});
