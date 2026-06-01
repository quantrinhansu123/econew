import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainCrudService } from '../common/domain-crud.service';
import { CreateNorthSouthShipmentDto } from './dto/create-north-south-shipment.dto';
import { UpdateNorthSouthShipmentDto } from './dto/update-north-south-shipment.dto';
import { NorthSouthShipmentEntity } from './north-south-shipment.entity';

@Injectable()
export class NorthSouthShipmentService extends DomainCrudService<NorthSouthShipmentEntity, CreateNorthSouthShipmentDto, UpdateNorthSouthShipmentDto, NorthSouthShipmentEntity> {
  constructor(
    @InjectRepository(NorthSouthShipmentEntity) private readonly northSouthShipmentRepository: Repository<NorthSouthShipmentEntity>,
  ) {
    super(northSouthShipmentRepository, { alias: 'northSouthShipment', searchColumns: ["bill","goods_name","service_type","destination","address","unit","payment_method","note","pickup_vehicle_status","external_vehicle_payment_method"], uniqueColumns: [], nullableStrings: ["note","pickup_vehicle_status","external_vehicle_payment_method"] });
  }
}
