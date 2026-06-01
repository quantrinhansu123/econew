import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainCrudService } from '../common/domain-crud.service';
import { CreateCarrierDirectoryDto } from './dto/create-carrier-directory.dto';
import { UpdateCarrierDirectoryDto } from './dto/update-carrier-directory.dto';
import { CarrierDirectoryEntity } from './carrier-directory.entity';

@Injectable()
export class CarrierDirectoryService extends DomainCrudService<CarrierDirectoryEntity, CreateCarrierDirectoryDto, UpdateCarrierDirectoryDto, CarrierDirectoryEntity> {
  constructor(
    @InjectRepository(CarrierDirectoryEntity) private readonly carrierDirectoryRepository: Repository<CarrierDirectoryEntity>,
  ) {
    super(carrierDirectoryRepository, { alias: 'carrierDirectory', searchColumns: ["region","carrier_name","license_plate"], uniqueColumns: [], nullableStrings: [] });
  }
}
