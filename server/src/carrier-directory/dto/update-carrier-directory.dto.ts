import { PartialType } from '@nestjs/swagger';
import { CreateCarrierDirectoryDto } from './create-carrier-directory.dto';

export class UpdateCarrierDirectoryDto extends PartialType(CreateCarrierDirectoryDto) {}
