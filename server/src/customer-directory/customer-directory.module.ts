import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerDirectoryController } from './customer-directory.controller';
import { CustomerDirectoryEntity } from './customer-directory.entity';
import { CustomerDirectoryService } from './customer-directory.service';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerDirectoryEntity])],
  controllers: [CustomerDirectoryController],
  providers: [CustomerDirectoryService],
  exports: [CustomerDirectoryService],
})
export class CustomerDirectoryModule {}
