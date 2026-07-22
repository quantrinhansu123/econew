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
  { status, headers: { 'Content-Type': 'application/json' } },
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

  it('uploads directly with only the apikey header for a new Supabase secret key', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_server_key';
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { Key: 'waybills/photo.jpg' }));

    const url = await createService().uploadWaybillImage(imageFile);

    const [requestUrl, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(String(requestUrl)).toContain('/storage/v1/object/payment-proofs/waybills/');
    expect(headers.apikey).toBe('sb_secret_server_key');
    expect(headers).not.toHaveProperty('Authorization');
    expect(url).toMatch(
      /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/public\/payment-proofs\/waybills\/.+\.jpg$/,
    );
  });

  it('keeps Bearer authorization for a legacy service-role JWT', async () => {
    config.SUPABASE_SERVICE_ROLE_KEY = 'eyJheader.eyJpayload.signature';
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { Key: 'waybills/photo.jpg' }));

    await createService().uploadWaybillImage(imageFile);

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.apikey).toBe(config.SUPABASE_SERVICE_ROLE_KEY);
    expect(headers.Authorization).toBe(`Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`);
  });

  it('falls back to the service-role key when a stale secret key is rejected', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_stale';
    config.SUPABASE_SERVICE_ROLE_KEY = 'eyJheader.eyJpayload.signature';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Invalid API key' }))
      .mockResolvedValueOnce(jsonResponse(200, { Key: 'waybills/photo.jpg' }));

    await expect(createService().uploadWaybillImage(imageFile)).resolves.toContain('/waybills/');

    const fallbackHeaders = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;
    expect(fallbackHeaders.apikey).toBe(config.SUPABASE_SERVICE_ROLE_KEY);
    expect(fallbackHeaders.Authorization).toBe(`Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`);
  });

  it('removes wrapping quotes copied into Render environment values', async () => {
    config.SUPABASE_URL = '"https://project.supabase.co/"';
    config.SUPABASE_SECRET_KEY = '"sb_secret_server_key"';
    config.SUPABASE_STORAGE_BUCKET = '"payment-proofs"';
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { Key: 'waybills/photo.jpg' }));

    await createService().uploadWaybillImage(imageFile);

    const [requestUrl, init] = fetchMock.mock.calls[0];
    expect(String(requestUrl)).toMatch(/^https:\/\/project\.supabase\.co\/storage/);
    expect((init?.headers as Record<string, string>).apikey).toBe('sb_secret_server_key');
  });

  it('returns an actionable error when every configured key is rejected', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_invalid';
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: 'Invalid API key' }));

    await expect(createService().uploadWaybillImage(imageFile)).rejects.toThrow(
      'Khóa Supabase Storage trên server không hợp lệ hoặc không đủ quyền.',
    );
  });

  it('returns an actionable error when the configured bucket does not exist', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_server_key';
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { message: 'Bucket not found' }));

    await expect(createService().uploadWaybillImage(imageFile)).rejects.toThrow(
      'Không tìm thấy bucket "payment-proofs" trên Supabase Storage.',
    );
  });

  it('maps network failures to the Storage connection error', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_server_key';
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(createService().uploadWaybillImage(imageFile)).rejects.toThrow(
      'Không kết nối được Supabase Storage.',
    );
  });

  it('uploads concurrent files without a bucket-listing request', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_server_key';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { Key: 'waybills/photo-1.jpg' }))
      .mockResolvedValueOnce(jsonResponse(200, { Key: 'vendor-payments/photo-2.jpg' }));

    const service = createService();
    await Promise.all([
      service.uploadWaybillImage(imageFile),
      service.uploadPaymentProof(imageFile),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).endsWith('/storage/v1/bucket'))).toBe(true);
  });
});
