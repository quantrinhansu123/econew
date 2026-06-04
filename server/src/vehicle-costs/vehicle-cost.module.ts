import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleCostController } from './vehicle-cost.controller';
import { VehicleCostEntity } from './vehicle-cost.entity';
import { VehicleCostService } from './vehicle-cost.service';

@Module({
  imports: [TypeOrmModule.forFeature([VehicleCostEntity])],
  controllers: [VehicleCostController],
  providers: [VehicleCostService],
  exports: [VehicleCostService],
})
export class VehicleCostModule {}
