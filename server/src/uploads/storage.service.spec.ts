import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

const priceListFile = { buffer: Buffer.from('%PDF-1.7 price-list'), mimetype: 'application/pdf', originalname: 'bao-gia.pdf', size: 18 } as Express.Multer.File;
const excelFile = { buffer: Buffer.from('PK\x03\x04xlsx-bytes'), mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', originalname: 'kich-thuoc.xlsx', size: 14 } as Express.Multer.File;
const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('StorageService', () => {
  let config: Record<string, string>;
  const imageFile = {
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAIAAAAUMWhjAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAMElEQVRIiWMQSdlCU8QwakHKaBBtGU1FIqMZbctoUSEyWpqmjFY4IqNVZsrgblUAAEjNhC7malOaAAAAAElFTkSuQmCC', 'base64'),
    mimetype: 'image/png', originalname: 'photo.png', size: 0,
  } as Express.Multer.File;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let usageMock: { acquireUploadPermit: jest.Mock };

  const createService = () => new StorageService(
    { get: jest.fn((key: string) => config[key]) } as unknown as ConfigService,
    usageMock as never,
  );

  beforeEach(() => {
    config = { CLOUDINARY_CLOUD_NAME: 'eco-cloud', CLOUDINARY_API_KEY: '123456', CLOUDINARY_API_SECRET: 'server-secret', CLOUDINARY_FOLDER: 'eco-transport' };
    usageMock = { acquireUploadPermit: jest.fn().mockResolvedValue(jest.fn()) };
    fetchMock = jest.spyOn(global, 'fetch');
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('uploads optimized vehicle documents with deterministic idempotency parameters', async () => {
    fetchMock.mockResolvedValueOnce(response(200, { secure_url: 'https://res.cloudinary.com/eco-cloud/image/upload/vehicle.webp' }));
    await expect(createService().uploadVehicleDocument(imageFile)).resolves.toContain('res.cloudinary.com');
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.cloudinary.com/v1_1/eco-cloud/auto/upload');
    const body = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(body.get('api_key')).toBe('123456');
    expect(body.get('folder')).toBe('eco-transport/vehicle-documents');
    expect(String(body.get('public_id'))).toMatch(/^asset-[a-f0-9]{64}$/);
    expect(body.get('overwrite')).toBe('false');
    expect(body.get('unique_filename')).toBe('false');
    expect((body.get('file') as Blob).type).toBe('image/webp');
    expect(String(body.get('signature'))).toMatch(/^[a-f0-9]{40}$/);
  });

  it('coalesces concurrent identical uploads in the same process', async () => {
    let resolveResponse: ((value: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    fetchMock.mockReturnValueOnce(pending);
    const service = createService();
    const first = service.uploadWaybillImage(imageFile);
    const second = service.uploadWaybillImage(imageFile);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveResponse?.(response(200, { secure_url: 'https://res.cloudinary.com/eco-cloud/image/upload/waybill.webp' }));
    await expect(Promise.all([first, second])).resolves.toEqual([
      'https://res.cloudinary.com/eco-cloud/image/upload/waybill.webp',
      'https://res.cloudinary.com/eco-cloud/image/upload/waybill.webp',
    ]);
  });

  it('removes wrapping quotes copied into environment values', async () => {
    config.CLOUDINARY_CLOUD_NAME = '"eco-cloud"';
    config.CLOUDINARY_API_KEY = '"123456"';
    fetchMock.mockResolvedValueOnce(response(200, { secure_url: 'https://res.cloudinary.com/eco-cloud/image/upload/photo.webp' }));
    await createService().uploadWaybillImage(imageFile);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/eco-cloud/auto/upload');
    expect((fetchMock.mock.calls[0][1]?.body as FormData).get('api_key')).toBe('123456');
  });

  it('returns an actionable error when Cloudinary rejects credentials', async () => {
    fetchMock.mockResolvedValueOnce(response(401, { error: { message: 'Invalid Signature' } }));
    await expect(createService().uploadWaybillImage(imageFile)).rejects.toThrow('Thông tin xác thực Cloudinary không hợp lệ hoặc không đủ quyền.');
  });

  it('maps network failures to the Cloudinary connection error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(createService().uploadWaybillImage(imageFile)).rejects.toThrow('Không kết nối được Cloudinary.');
  });

  it('rejects a successful response without secure_url', async () => {
    fetchMock.mockResolvedValueOnce(response(200, { public_id: 'waybills/photo' }));
    await expect(createService().uploadWaybillImage(imageFile)).rejects.toThrow('Cloudinary không trả về URL file hợp lệ.');
  });

  it('rejects files whose declared MIME or magic bytes do not match', async () => {
    const invalid = { buffer: Buffer.from('not-an-image'), mimetype: 'image/jpeg', originalname: 'photo.jpg', size: 12 } as Express.Multer.File;
    await expect(createService().uploadWaybillImage(invalid)).rejects.toThrow('Nội dung file không phải ảnh hợp lệ.');
    const mismatch = { ...imageFile, mimetype: 'image/jpeg' } as Express.Multer.File;
    await expect(createService().uploadWaybillImage(mismatch)).rejects.toThrow('Kiểu file ảnh không khớp với nội dung thực tế.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uploads PDF price lists and Excel dimension files after signature validation', async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, { secure_url: 'https://res.cloudinary.com/eco-cloud/raw/upload/bao-gia.pdf' }))
      .mockResolvedValueOnce(response(200, { secure_url: 'https://res.cloudinary.com/eco-cloud/raw/upload/kich-thuoc.xlsx' }));
    const service = createService();
    await expect(service.uploadCustomerPriceList(priceListFile, 'acesco')).resolves.toContain('bao-gia.pdf');
    await expect(service.uploadWaybillDimensionFile(excelFile)).resolves.toContain('kich-thuoc.xlsx');
    expect((fetchMock.mock.calls[0][1]?.body as FormData).get('folder')).toBe('eco-transport/customer-price-lists/ACESCO');
    expect((fetchMock.mock.calls[1][1]?.body as FormData).get('folder')).toBe('eco-transport/waybill-dimensions');
  });
});
