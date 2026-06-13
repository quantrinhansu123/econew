import { PartialType } from '@nestjs/swagger';
import { CreateAttendanceLocationDto } from './create-attendance-location.dto';

export class UpdateAttendanceLocationDto extends PartialType(CreateAttendanceLocationDto) {}
