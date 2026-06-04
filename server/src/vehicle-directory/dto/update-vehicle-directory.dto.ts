import { PartialType } from '@nestjs/swagger';
import { CreateVehicleDirectoryDto } from './create-vehicle-directory.dto';

export class UpdateVehicleDirectoryDto extends PartialType(CreateVehicleDirectoryDto) {}
