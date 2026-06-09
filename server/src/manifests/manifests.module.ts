import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { TripEntity } from '../trips/trip.entity';
import { WaybillSplitEntity } from '../waybills/waybill-split.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
import { ManifestWaybillEntity } from './manifest-waybill.entity';
import { ManifestEntity } from './manifest.entity';
import { ManifestsController } from './manifests.controller';
import { ManifestsService } from './manifests.service';

@Module({
  imports: [TypeOrmModule.forFeature([ManifestEntity, ManifestWaybillEntity, WaybillEntity, WaybillSplitEntity, HubEntity, TripEntity])],
  controllers: [ManifestsController],
  providers: [ManifestsService],
  exports: [ManifestsService],
})
export class ManifestsModule {}
