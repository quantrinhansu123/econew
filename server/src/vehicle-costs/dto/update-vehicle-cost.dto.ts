import { PartialType } from '@nestjs/swagger';
import { CreateVehicleCostDto } from './create-vehicle-cost.dto';

export class UpdateVehicleCostDto extends PartialType(CreateVehicleCostDto) {}
