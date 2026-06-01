import { PartialType } from '@nestjs/swagger';
import { CreateCustomerDirectoryDto } from './create-customer-directory.dto';

export class UpdateCustomerDirectoryDto extends PartialType(CreateCustomerDirectoryDto) {}
