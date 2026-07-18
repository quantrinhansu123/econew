import {
  Controller,
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

  @Post('waybill-images')
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
}
