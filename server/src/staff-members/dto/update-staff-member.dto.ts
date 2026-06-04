import { PartialType } from '@nestjs/swagger';
import { CreateStaffMemberDto } from './create-staff-member.dto';

export class UpdateStaffMemberDto extends PartialType(CreateStaffMemberDto) {}
