import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NorthSouthShipmentController } from './north-south-shipment.controller';
import { NorthSouthShipmentEntity } from './north-south-shipment.entity';
import { NorthSouthShipmentService } from './north-south-shipment.service';

@Module({
  imports: [TypeOrmModule.forFeature([NorthSouthShipmentEntity])],
  controllers: [NorthSouthShipmentController],
  providers: [NorthSouthShipmentService],
  exports: [NorthSouthShipmentService],
})
export class NorthSouthShipmentModule {}
