import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { CloudinaryUsageService } from './cloudinary-usage.service';
import {
  MAX_IMAGE_INPUT_BYTES,
  MAX_RAW_FILE_BYTES,
  prepareImage,
  prepareRawFile,
  PreparedUpload,
} from './image-pipeline';

export { MAX_IMAGE_INPUT_BYTES, MAX_RAW_FILE_BYTES } from './image-pipeline';

const STORAGE_TIMEOUT_MS = 12_000;
const PRICE_LIST_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp']);
const SPREADSHEET_EXTENSIONS = new Set(['xlsx', 'xls']);

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly inFlightUploads = new Map<string, Promise<string>>();

  constructor(
    private readonly configService: ConfigService,
    private readonly cloudinaryUsage: CloudinaryUsageService,
  ) {}

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
    return this.storeObject(await prepareImage(file), folder);
  }

  private async storeObject(file: PreparedUpload, folder: string): Promise<string> {
    const cloudinaryFolder = `${this.rootFolder}/${folder.replace(/^\/+|\/+$/g, '')}`;
    const extension = file.originalname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || '';
    const publicId = `asset-${file.digest}${extension && file.mimetype !== 'image/webp' ? `.${extension}` : ''}`;
    const key = `${cloudinaryFolder}/${publicId}`;
    const existing = this.inFlightUploads.get(key);
    if (existing) return existing;

    const uploadPromise = this.performUpload(file, cloudinaryFolder, publicId);
    this.inFlightUploads.set(key, uploadPromise);
    try {
      return await uploadPromise;
    } finally {
      if (this.inFlightUploads.get(key) === uploadPromise) this.inFlightUploads.delete(key);
    }
  }

  private async performUpload(file: PreparedUpload, cloudinaryFolder: string, publicId: string): Promise<string> {
    const releasePermit = await this.cloudinaryUsage.acquireUploadPermit();
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signatureParams: Record<string, string> = {
        folder: cloudinaryFolder,
        overwrite: 'false',
        public_id: publicId,
        timestamp,
        unique_filename: 'false',
      };
      const signingString = Object.keys(signatureParams)
        .sort()
        .map((key) => `${key}=${signatureParams[key]}`)
        .join('&');
      const signature = createHash('sha1').update(`${signingString}${this.apiSecret}`).digest('hex');
      const body = new FormData();
      body.append('api_key', this.apiKey);
      body.append('timestamp', timestamp);
      body.append('folder', cloudinaryFolder);
      body.append('public_id', publicId);
      body.append('overwrite', 'false');
      body.append('unique_filename', 'false');
      body.append('signature', signature);
      body.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname || 'upload');

    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), STORAGE_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/auto/upload`, {
          method: 'POST',
          body,
          signal: timeoutController.signal,
        });
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
    } finally {
      releasePermit();
    }
  }

  uploadPaymentProof(file: Express.Multer.File): Promise<string> { return this.uploadImage(file, 'vendor-payments'); }
  uploadExpenseReceipt(file: Express.Multer.File): Promise<string> { return this.uploadImage(file, 'expense-receipts'); }
  uploadWaybillImage(file: Express.Multer.File): Promise<string> { return this.uploadImage(file, 'waybills'); }
  uploadVehicleDocument(file: Express.Multer.File): Promise<string> { return this.uploadImage(file, 'vehicle-documents'); }
  uploadCashVoucherImage(file: Express.Multer.File): Promise<string> { return this.uploadImage(file, 'cash-vouchers'); }

  uploadVendorQrImage(file: Express.Multer.File, vendorCode: string): Promise<string> {
    const normalizedCode = vendorCode?.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    if (!normalizedCode) throw new BadRequestException('Nhập mã NCC trước khi tải ảnh QR.');
    return this.uploadImage(file, `vendor-qr/${normalizedCode}`);
  }

  async uploadCustomerPriceList(file: Express.Multer.File, customerCode: string): Promise<string> {
    if (!file?.buffer?.length) throw new BadRequestException('Thiếu file bảng giá.');
    const normalizedCustomerCode = customerCode?.trim().toUpperCase() || '';
    if (!normalizedCustomerCode) throw new BadRequestException('Thiếu mã khách hàng của bảng giá.');
    const customerFolder = normalizedCustomerCode.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    if (!customerFolder) throw new BadRequestException('Mã khách hàng không hợp lệ.');
    const extension = file.originalname?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || '';
    if (!PRICE_LIST_EXTENSIONS.has(extension)) throw new BadRequestException('Chỉ chấp nhận bảng giá PDF hoặc ảnh JPG, PNG, WebP.');
    if (extension === 'pdf') return this.storeObject(prepareRawFile(file, new Set(['pdf']), 'file bảng giá'), `customer-price-lists/${customerFolder}`);
    return this.storeObject(await prepareImage(file), `customer-price-lists/${customerFolder}`);
  }

  async uploadWaybillDimensionFile(file: Express.Multer.File): Promise<string> {
    const prepared = prepareRawFile(file, SPREADSHEET_EXTENSIONS, 'file quy đổi kích thước');
    return this.storeObject(prepared, 'waybill-dimensions');
  }
}
