import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

const imageFile = {
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  mimetype: 'image/jpeg',
  size: 6,
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
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 'payment-proofs', public: true }]))
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
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 'payment-proofs', public: true }]))
      .mockResolvedValueOnce(jsonResponse(200, { Key: 'waybills/photo.jpg' }));

    await createService().uploadWaybillImage(imageFile);

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.apikey).toBe('sb_secret_render_key');
    expect(headers).not.toHaveProperty('Authorization');
  });

  it('falls back to the service-role key when a stale secret key is rejected', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_stale';
    config.SUPABASE_SERVICE_ROLE_KEY = 'eyJheader.eyJpayload.signature';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Invalid API key' }))
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 'payment-proofs', public: true }]))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Invalid API key' }))
      .mockResolvedValueOnce(jsonResponse(200, { Key: 'waybills/photo.jpg' }));

    await expect(createService().uploadWaybillImage(imageFile)).resolves.toContain('/waybills/');

    const listFallbackHeaders = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;
    const uploadFallbackHeaders = fetchMock.mock.calls[3][1]?.headers as Record<string, string>;
    expect(listFallbackHeaders.apikey).toBe(config.SUPABASE_SERVICE_ROLE_KEY);
    expect(listFallbackHeaders.Authorization).toBe(`Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`);
    expect(uploadFallbackHeaders.apikey).toBe(config.SUPABASE_SERVICE_ROLE_KEY);
    expect(uploadFallbackHeaders.Authorization).toBe(`Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`);
  });

  it('removes wrapping quotes copied into Render environment values', async () => {
    config.SUPABASE_URL = '"https://project.supabase.co/"';
    config.SUPABASE_SECRET_KEY = '"sb_secret_server_key"';
    config.SUPABASE_STORAGE_BUCKET = '"payment-proofs"';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 'payment-proofs', public: true }]))
      .mockResolvedValueOnce(jsonResponse(200, { Key: 'waybills/photo.jpg' }));

    await createService().uploadWaybillImage(imageFile);

    const [requestUrl, init] = fetchMock.mock.calls[1];
    expect(String(requestUrl)).toMatch(/^https:\/\/project\.supabase\.co\/storage/);
    expect((init?.headers as Record<string, string>).apikey).toBe('sb_secret_server_key');
  });

  it('keeps Bearer authorization for a legacy service-role JWT', async () => {
    config.SUPABASE_SERVICE_ROLE_KEY = 'eyJheader.eyJpayload.signature';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [{ name: 'payment-proofs', public: true }]))
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

  it('rejects a file whose bytes do not match its declared image MIME type', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_server_key';
    const fakeImage = {
      ...imageFile,
      buffer: Buffer.from('not-an-image'),
      size: 12,
    } as Express.Multer.File;

    await expect(createService().uploadWaybillImage(fakeImage)).rejects.toThrow(
      'Nội dung file không khớp định dạng ảnh đã khai báo.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks the actual buffer size even when metadata understates it', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_server_key';
    const oversized = {
      ...imageFile,
      buffer: Buffer.concat([
        imageFile.buffer,
        Buffer.alloc(5 * 1024 * 1024),
      ]),
      size: imageFile.size,
    } as Express.Multer.File;

    await expect(createService().uploadWaybillImage(oversized)).rejects.toThrow('Ảnh tối đa 5 MB.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('makes an existing private bucket public before returning public URLs', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_server_key';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [{
        id: 'payment-proofs',
        name: 'payment-proofs',
        public: false,
      }]))
      .mockResolvedValueOnce(jsonResponse(200, { message: 'Successfully updated' }))
      .mockResolvedValueOnce(jsonResponse(200, { Key: 'waybills/photo.jpg' }));

    await expect(createService().uploadWaybillImage(imageFile)).resolves.toContain('/object/public/');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://project.supabase.co/storage/v1/bucket/payment-proofs',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          id: 'payment-proofs',
          name: 'payment-proofs',
          public: true,
        }),
      }),
    );
  });

  it('fails clearly and does not upload when a private bucket cannot be made public', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_server_key';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 'payment-proofs', public: false }]))
      .mockResolvedValueOnce(jsonResponse(500, { message: 'update failed' }));

    await expect(createService().uploadWaybillImage(imageFile)).rejects.toThrow(
      'Bucket "payment-proofs" đang ở chế độ private và không thể chuyển sang public.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 'payment-proofs', public: true }]))
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
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 'payment-proofs', public: true }]))
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

  it('verifies that a managed waybill object exists through Storage metadata', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_server_key';
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { name: 'photo.jpg', size: 6 }));
    const url = 'https://project.supabase.co/storage/v1/object/public/payment-proofs/waybills/1770000000000-0123456789abcdef.jpg';

    await expect(createService().assertWaybillImagesExist([url])).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://project.supabase.co/storage/v1/object/info/payment-proofs/waybills/1770000000000-0123456789abcdef.jpg',
      expect.objectContaining({ headers: expect.objectContaining({ apikey: 'sb_secret_server_key' }) }),
    );
  });

  it('rejects delivery when the referenced waybill object is missing', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_server_key';
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { message: 'not found' }));
    const url = 'https://project.supabase.co/storage/v1/object/public/payment-proofs/waybills/1770000000000-0123456789abcdef.jpg';

    await expect(createService().assertWaybillImagesExist([url])).rejects.toThrow(
      'Ảnh giao hàng không tồn tại trên Storage. Vui lòng upload lại.',
    );
  });

  it('does not perform a Storage request for an external waybill URL', async () => {
    config.SUPABASE_SECRET_KEY = 'sb_secret_server_key';

    await expect(createService().assertWaybillImagesExist([
      'https://example.com/waybills/photo.jpg',
    ])).rejects.toThrow('Ảnh giao hàng phải được upload bằng hệ thống.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
