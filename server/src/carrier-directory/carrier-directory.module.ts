import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CarrierDirectoryController } from './carrier-directory.controller';
import { CarrierDirectoryEntity } from './carrier-directory.entity';
import { CarrierDirectoryService } from './carrier-directory.service';

@Module({
  imports: [TypeOrmModule.forFeature([CarrierDirectoryEntity])],
  controllers: [CarrierDirectoryController],
  providers: [CarrierDirectoryService],
  exports: [CarrierDirectoryService],
})
export class CarrierDirectoryModule {}
