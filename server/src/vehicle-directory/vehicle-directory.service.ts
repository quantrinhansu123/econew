import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainCrudService } from '../common/domain-crud.service';
import { CreateVehicleDirectoryDto } from './dto/create-vehicle-directory.dto';
import { UpdateVehicleDirectoryDto } from './dto/update-vehicle-directory.dto';
import { VehicleDirectoryEntity } from './vehicle-directory.entity';

@Injectable()
export class VehicleDirectoryService extends DomainCrudService<VehicleDirectoryEntity, CreateVehicleDirectoryDto, UpdateVehicleDirectoryDto, VehicleDirectoryEntity> {
  constructor(
    @InjectRepository(VehicleDirectoryEntity) private readonly vehicleDirectoryRepository: Repository<VehicleDirectoryEntity>,
  ) {
    super(vehicleDirectoryRepository, { alias: 'vehicleDirectory', searchColumns: ["driver_name","region","carrier_name","license_plate","vehicle_type"], uniqueColumns: ["license_plate"], nullableStrings: [] });
  }
}
