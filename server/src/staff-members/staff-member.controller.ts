import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { CreateStaffMemberDto } from './dto/create-staff-member.dto';
import { QueryStaffMemberDto } from './dto/query-staff-member.dto';
import { UpdateStaffMemberDto } from './dto/update-staff-member.dto';
import { StaffMemberService } from './staff-member.service';

@ApiTags('Staff Members')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('staff-members')
export class StaffMemberController {
  constructor(private readonly staffMemberService: StaffMemberService) {}

  @Get()
  @ApiOperation({ summary: 'List Staff Members' })
  list(@Query() query: QueryStaffMemberDto) { return this.staffMemberService.list(query); }

  @Get(':id')
  @ApiOperation({ summary: 'Get Staff Members record' })
  findOne(@Param('id') id: string) { return this.staffMemberService.findOne(id); }

  @Post()
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create Staff Members record' })
  create(@Body() dto: CreateStaffMemberDto) { return this.staffMemberService.create(dto); }

  @Patch(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update Staff Members record' })
  update(@Param('id') id: string, @Body() dto: UpdateStaffMemberDto) { return this.staffMemberService.update(id, dto); }

  @Delete(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Delete Staff Members record' })
  async remove(@Param('id') id: string) { await this.staffMemberService.remove(id); return { success: true }; }
}
