import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

const imageFile = { buffer: Buffer.from('image-bytes'), mimetype: 'image/jpeg', originalname: 'photo.jpg', size: 11 } as Express.Multer.File;
const priceListFile = { buffer: Buffer.from('%PDF-1.7 price-list'), mimetype: 'application/pdf', originalname: 'bao-gia.pdf', size: 11 } as Express.Multer.File;
const excelFile = { buffer: Buffer.from('xlsx-bytes'), mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', originalname: 'kich-thuoc.xlsx', size: 11 } as Express.Multer.File;
const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('StorageService', () => {
  let config: Record<string, string>;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  const createService = () => new StorageService({ get: jest.fn((key: string) => config[key]) } as unknown as ConfigService);

  beforeEach(() => {
    config = { CLOUDINARY_CLOUD_NAME: 'eco-cloud', CLOUDINARY_API_KEY: '123456', CLOUDINARY_API_SECRET: 'server-secret', CLOUDINARY_FOLDER: 'eco-transport' };
    fetchMock = jest.spyOn(global, 'fetch');
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('uploads vehicle documents to the configured Cloudinary folder', async () => {
    fetchMock.mockResolvedValueOnce(response(200, { secure_url: 'https://res.cloudinary.com/eco-cloud/image/upload/vehicle.jpg' }));
    await expect(createService().uploadVehicleDocument(imageFile)).resolves.toContain('res.cloudinary.com');
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.cloudinary.com/v1_1/eco-cloud/auto/upload');
    const body = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(body.get('api_key')).toBe('123456');
    expect(body.get('folder')).toBe('eco-transport/vehicle-documents');
    expect(String(body.get('signature'))).toMatch(/^[a-f0-9]{40}$/);
  });

  it('removes wrapping quotes copied into environment values', async () => {
    config.CLOUDINARY_CLOUD_NAME = '"eco-cloud"';
    config.CLOUDINARY_API_KEY = '"123456"';
    fetchMock.mockResolvedValueOnce(response(200, { secure_url: 'https://res.cloudinary.com/eco-cloud/image/upload/photo.jpg' }));
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

  it('uploads PDF price lists and Excel dimension files through auto resource detection', async () => {
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
