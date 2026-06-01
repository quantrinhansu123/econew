import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainCrudService } from '../common/domain-crud.service';
import { CreateCustomerDirectoryDto } from './dto/create-customer-directory.dto';
import { UpdateCustomerDirectoryDto } from './dto/update-customer-directory.dto';
import { CustomerDirectoryEntity } from './customer-directory.entity';

@Injectable()
export class CustomerDirectoryService extends DomainCrudService<CustomerDirectoryEntity, CreateCustomerDirectoryDto, UpdateCustomerDirectoryDto, CustomerDirectoryEntity> {
  constructor(
    @InjectRepository(CustomerDirectoryEntity) private readonly customerDirectoryRepository: Repository<CustomerDirectoryEntity>,
  ) {
    super(customerDirectoryRepository, { alias: 'customerDirectory', searchColumns: ["full_name","phone","address","customer_code"], uniqueColumns: ["customer_code"], nullableStrings: [] });
  }
}
