import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainCrudService } from '../common/domain-crud.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseEntity } from './warehouse.entity';

@Injectable()
export class WarehouseService extends DomainCrudService<WarehouseEntity, CreateWarehouseDto, UpdateWarehouseDto, WarehouseEntity> {
  constructor(
    @InjectRepository(WarehouseEntity) private readonly warehouseRepository: Repository<WarehouseEntity>,
  ) {
    super(warehouseRepository, { alias: 'warehouse', searchColumns: ["warehouse_name"], uniqueColumns: [], nullableStrings: [] });
  }
}
