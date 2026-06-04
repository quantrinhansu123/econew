import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
import { DeliveryRouteEntity } from './route.entity';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';

@Module({
  imports: [TypeOrmModule.forFeature([DeliveryRouteEntity, HubEntity, WaybillEntity])],
  controllers: [RoutesController],
  providers: [RoutesService],
  exports: [RoutesService],
})
export class RoutesModule {}
