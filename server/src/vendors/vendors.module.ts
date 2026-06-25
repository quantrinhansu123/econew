import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManifestWaybillEntity } from '../manifests/manifest-waybill.entity';
import { TripEntity } from '../trips/trip.entity';
import { VendorDebtEntryEntity } from './vendor-debt-entry.entity';
import { VendorPaymentEntity } from './vendor-payment.entity';
import { VendorEntity } from './vendor.entity';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  imports: [TypeOrmModule.forFeature([VendorEntity, VendorDebtEntryEntity, VendorPaymentEntity, TripEntity, ManifestWaybillEntity])],
  controllers: [VendorsController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
