import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { UploadsController } from './uploads.controller';
import { CloudinaryUsageService } from './cloudinary-usage.service';

@Module({
  controllers: [UploadsController],
  providers: [StorageService, CloudinaryUsageService],
  exports: [StorageService],
})
export class UploadsModule {}
