import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainCrudService } from '../common/domain-crud.service';
import { CreateChanhShipmentDto } from './dto/create-chanh-shipment.dto';
import { UpdateChanhShipmentDto } from './dto/update-chanh-shipment.dto';
import { ChanhShipmentEntity } from './chanh-shipment.entity';

@Injectable()
export class ChanhShipmentService extends DomainCrudService<ChanhShipmentEntity, CreateChanhShipmentDto, UpdateChanhShipmentDto, ChanhShipmentEntity> {
  constructor(
    @InjectRepository(ChanhShipmentEntity) private readonly chanhShipmentRepository: Repository<ChanhShipmentEntity>,
  ) {
    super(chanhShipmentRepository, { alias: 'chanhShipment', searchColumns: ["province_code","company_name","goods_name","goods_type","cost_type","note","carrier_name","license_plate","bill"], uniqueColumns: [], nullableStrings: ["note"] });
  }
}
