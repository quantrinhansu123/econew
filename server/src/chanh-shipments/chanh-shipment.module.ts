import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChanhShipmentController } from './chanh-shipment.controller';
import { ChanhShipmentEntity } from './chanh-shipment.entity';
import { ChanhShipmentService } from './chanh-shipment.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChanhShipmentEntity])],
  controllers: [ChanhShipmentController],
  providers: [ChanhShipmentService],
  exports: [ChanhShipmentService],
})
export class ChanhShipmentModule {}
