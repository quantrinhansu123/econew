import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PRICE_LIST_BYTES = 10 * 1024 * 1024;
const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;
const STORAGE_TIMEOUT_MS = 12_000;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const PRICE_LIST_MIME_EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const PRICE_LIST_EXTENSIONS = new Set(Object.values(PRICE_LIST_MIME_EXT));

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly configService: ConfigService) {}

  private cleanEnvValue(value?: string): string {
    const trimmed = value?.trim() || '';
    const wrapped = trimmed.match(/^(['"])([\s\S]*)\1$/);
    return (wrapped?.[2] || trimmed).trim();
  }

  private get cloudName(): string {
    const value = this.cleanEnvValue(this.configService.get<string>('CLOUDINARY_CLOUD_NAME'));
    if (!value) throw new InternalServerErrorException('CLOUDINARY_CLOUD_NAME chưa được cấu hình trên server.');
    if (!/^[a-z0-9_-]+$/i.test(value)) throw new InternalServerErrorException('CLOUDINARY_CLOUD_NAME trên server không hợp lệ.');
    return value;
  }

  private get apiKey(): string {
    const value = this.cleanEnvValue(this.configService.get<string>('CLOUDINARY_API_KEY'));
    if (!value) throw new InternalServerErrorException('CLOUDINARY_API_KEY chưa được cấu hình trên server.');
    return value;
  }

  private get apiSecret(): string {
    const value = this.cleanEnvValue(this.configService.get<string>('CLOUDINARY_API_SECRET'));
    if (!value) throw new InternalServerErrorException('CLOUDINARY_API_SECRET chưa được cấu hình trên server.');
    return value;
  }

  private get rootFolder(): string {
    const value = this.cleanEnvValue(this.configService.get<string>('CLOUDINARY_FOLDER')) || 'eco-transport';
    if (!/^[a-z0-9/_-]+$/i.test(value)) throw new InternalServerErrorException('CLOUDINARY_FOLDER trên server không hợp lệ.');
    return value.replace(/^\/+|\/+$/g, '');
  }

  private async uploadImage(file: Express.Multer.File, folder: string): Promise<string> {
    if (!file?.buffer?.length) throw new BadRequestException('Thiếu file ảnh.');
    if (file.size > MAX_BYTES) throw new BadRequestException('Ảnh tối đa 5 MB.');
    if (!ALLOWED_MIME.has(file.mimetype)) throw new BadRequestException('Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc GIF.');
    return this.storeObject(file, folder);
  }

  private async storeObject(file: Express.Multer.File, folder: string): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const cloudinaryFolder = `${this.rootFolder}/${folder}`;
    const signature = createHash('sha1').update(`folder=${cloudinaryFolder}&timestamp=${timestamp}${this.apiSecret}`).digest('hex');
    const body = new FormData();
    body.append('api_key', this.apiKey);
    body.append('timestamp', timestamp);
    body.append('folder', cloudinaryFolder);
    body.append('signature', signature);
    body.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname || 'upload');

    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), STORAGE_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/auto/upload`, { method: 'POST', body, signal: timeoutController.signal });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Cloudinary upload network error: ${detail}`);
      throw new InternalServerErrorException('Không kết nối được Cloudinary.');
    } finally {
      clearTimeout(timeout);
    }

    const payload = await response.json().catch(() => null) as { secure_url?: unknown; error?: { message?: unknown } } | null;
    if (!response.ok) {
      const detail = typeof payload?.error?.message === 'string' ? payload.error.message : `HTTP ${response.status}`;
      this.logger.error(`Cloudinary upload failed: ${detail}`);
      if (response.status === 401 || response.status === 403) throw new InternalServerErrorException('Thông tin xác thực Cloudinary không hợp lệ hoặc không đủ quyền.');
      throw new InternalServerErrorException('Không upload được file lên Cloudinary.');
    }
    if (typeof payload?.secure_url !== 'string' || !payload.secure_url.startsWith('https://')) {
      this.logger.error('Cloudinary upload succeeded without a secure_url.');
      throw new InternalServerErrorException('Cloudinary không trả về URL file hợp lệ.');
    }
    return payload.secure_url;
  }

  uploadPaymentProof(file: Express.Multer.File): Promise<string> { return this.uploadImage(file, 'vendor-payments'); }
  uploadExpenseReceipt(file: Express.Multer.File): Promise<string> { return this.uploadImage(file, 'expense-receipts'); }
  uploadWaybillImage(file: Express.Multer.File): Promise<string> { return this.uploadImage(file, 'waybills'); }
  uploadVehicleDocument(file: Express.Multer.File): Promise<string> { return this.uploadImage(file, 'vehicle-documents'); }

  uploadVendorQrImage(file: Express.Multer.File, vendorCode: string): Promise<string> {
    const normalizedCode = vendorCode?.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    if (!normalizedCode) throw new BadRequestException('Nhập mã NCC trước khi tải ảnh QR.');
    return this.uploadImage(file, `vendor-qr/${normalizedCode}`);
  }

  async uploadCustomerPriceList(file: Express.Multer.File, customerCode: string): Promise<string> {
    if (!file?.buffer?.length) throw new BadRequestException('Thiếu file bảng giá.');
    if (file.size > MAX_PRICE_LIST_BYTES) throw new BadRequestException('File bảng giá tối đa 10 MB.');
    const normalizedCustomerCode = customerCode?.trim().toUpperCase() || '';
    if (!normalizedCustomerCode) throw new BadRequestException('Thiếu mã khách hàng của bảng giá.');
    const customerFolder = normalizedCustomerCode.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    if (!customerFolder) throw new BadRequestException('Mã khách hàng không hợp lệ.');
    const nameExt = file.originalname?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || '';
    const mimeExt = PRICE_LIST_MIME_EXT[file.mimetype];
    if (!mimeExt && !PRICE_LIST_EXTENSIONS.has(nameExt)) throw new BadRequestException('Chỉ chấp nhận bảng giá PDF hoặc ảnh JPG, PNG, WebP.');
    return this.storeObject(file, `customer-price-lists/${customerFolder}`);
  }

  async uploadWaybillDimensionFile(file: Express.Multer.File): Promise<string> {
    if (!file?.buffer?.length) throw new BadRequestException('Thiếu file quy đổi kích thước.');
    if (file.size > MAX_SPREADSHEET_BYTES) throw new BadRequestException('File quy đổi tối đa 10 MB.');
    const nameExt = file.originalname?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || '';
    if (!new Set(['xlsx', 'xls']).has(nameExt)) throw new BadRequestException('Chỉ chấp nhận file Excel .xlsx hoặc .xls.');
    return this.storeObject(file, 'waybill-dimensions');
  }
}
