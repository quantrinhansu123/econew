import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleDirectoryController } from './vehicle-directory.controller';
import { VehicleDirectoryEntity } from './vehicle-directory.entity';
import { VehicleDirectoryService } from './vehicle-directory.service';

@Module({
  imports: [TypeOrmModule.forFeature([VehicleDirectoryEntity])],
  controllers: [VehicleDirectoryController],
  providers: [VehicleDirectoryService],
  exports: [VehicleDirectoryService],
})
export class VehicleDirectoryModule {}
