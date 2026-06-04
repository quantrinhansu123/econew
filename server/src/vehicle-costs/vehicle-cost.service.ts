import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainCrudService } from '../common/domain-crud.service';
import { CreateVehicleCostDto } from './dto/create-vehicle-cost.dto';
import { UpdateVehicleCostDto } from './dto/update-vehicle-cost.dto';
import { VehicleCostEntity } from './vehicle-cost.entity';

@Injectable()
export class VehicleCostService extends DomainCrudService<VehicleCostEntity, CreateVehicleCostDto, UpdateVehicleCostDto, VehicleCostEntity> {
  constructor(
    @InjectRepository(VehicleCostEntity) private readonly vehicleCostRepository: Repository<VehicleCostEntity>,
  ) {
    super(vehicleCostRepository, { alias: 'vehicleCost', searchColumns: ["license_plate","vehicle_type","cost_type","status"], uniqueColumns: [], nullableStrings: [] });
  }
}
