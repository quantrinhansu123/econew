import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { StorageService } from './storage.service';

@ApiTags('Uploads')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly storageService: StorageService) {}

  @Post('payment-proofs')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Upload ảnh chứng từ thanh toán NCC lên Supabase Storage' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadPaymentProof(@UploadedFile() file: Express.Multer.File) {
    return this.storageService.uploadPaymentProof(file).then((url) => ({ url }));
  }

  @Post('expense-receipts')
  @HttpCode(HttpStatus.OK)
  @RequireRoles(Roles.WAREHOUSE, Roles.DISPATCHER, Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Upload ảnh chứng từ hoặc biên lai khoản chi' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadExpenseReceipt(@UploadedFile() file: Express.Multer.File) {
    return this.storageService.uploadExpenseReceipt(file).then((url) => ({ url }));
  }

  @Post('waybill-images')
  @HttpCode(HttpStatus.OK)
  @RequireRoles(Roles.WAREHOUSE, Roles.PACKER, Roles.DRIVER, Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Upload ảnh bill/hàng hóa lên Supabase Storage' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadWaybillImage(@UploadedFile() file: Express.Multer.File) {
    return this.storageService.uploadWaybillImage(file).then((url) => ({ url }));
  }

  @Post('waybill-dimension-files')
  @HttpCode(HttpStatus.OK)
  @RequireRoles(Roles.WAREHOUSE, Roles.PACKER, Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Upload file Excel quy đổi kích thước của vận đơn' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadWaybillDimensionFile(@UploadedFile() file: Express.Multer.File) {
    return this.storageService.uploadWaybillDimensionFile(file).then((url) => ({ url, name: file.originalname }));
  }

  @Post('vendor-qr-images/:vendorCode')
  @HttpCode(HttpStatus.OK)
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Upload ảnh QR nhận tiền của NCC lên Supabase Storage' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadVendorQrImage(
    @Param('vendorCode') vendorCode: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.storageService.uploadVendorQrImage(file, vendorCode).then((url) => ({ url }));
  }

  @Post('customer-price-lists/:customerCode')
  @HttpCode(HttpStatus.OK)
  @RequireRoles(Roles.WAREHOUSE, Roles.PACKER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Upload ảnh/PDF bảng giá theo mã khách hàng' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadCustomerPriceList(
    @Param('customerCode') customerCode: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.storageService.uploadCustomerPriceList(file, customerCode).then((url) => ({ url }));
  }
}
