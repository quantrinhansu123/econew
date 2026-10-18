import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { DeliveryDistanceController } from './delivery-distance.controller';
import { DeliveryDistanceService } from './delivery-distance.service';
import { HereQuotaService } from './here-quota.service';

@Module({
  imports: [TypeOrmModule.forFeature([HubEntity])],
  controllers: [DeliveryDistanceController],
  providers: [DeliveryDistanceService, HereQuotaService],
})
export class DeliveryDistanceModule {}
