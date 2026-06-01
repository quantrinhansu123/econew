import { PartialType } from '@nestjs/swagger';
import { CreateNorthSouthShipmentDto } from './create-north-south-shipment.dto';

export class UpdateNorthSouthShipmentDto extends PartialType(CreateNorthSouthShipmentDto) {}
