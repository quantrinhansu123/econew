import { PartialType } from '@nestjs/swagger';
import { CreateChanhShipmentDto } from './create-chanh-shipment.dto';

export class UpdateChanhShipmentDto extends PartialType(CreateChanhShipmentDto) {}
