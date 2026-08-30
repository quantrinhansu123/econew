import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { UserEntity } from '../users/user.entity';
import { CreateStaffMemberDto } from './dto/create-staff-member.dto';
import { QueryStaffMemberDto } from './dto/query-staff-member.dto';
import { UpdateStaffMemberDto } from './dto/update-staff-member.dto';
import { CreateStaffDepartmentDto, UpdateStaffDepartmentDto } from './dto/staff-department.dto';
import { UpsertStaffAttendanceDto } from './dto/upsert-staff-attendance.dto';
import { CreateSalaryAdvanceDto } from './dto/create-salary-advance.dto';
import { UpdateSalaryAdvanceDto } from './dto/update-salary-advance.dto';
import { UpsertPayrollAdjustmentDto } from './dto/upsert-payroll-adjustment.dto';
import { StaffMemberService } from './staff-member.service';
import { CreateSalaryPaymentDto } from './dto/create-salary-payment.dto';

@ApiTags('Staff Members')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('staff-members')
export class StaffMemberController {
  constructor(private readonly staffMemberService: StaffMemberService) {}

  @Get()
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List Staff Members' })
  list(@Query() query: QueryStaffMemberDto, @CurrentUser() currentUser: UserEntity) {
    return this.staffMemberService.list(query, currentUser);
  }

  @Get('departments/list')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  listDepartments(@Query('include_inactive') includeInactive?: string) {
    return this.staffMemberService.listDepartments(includeInactive === 'true');
  }

  @Post('departments')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  createDepartment(@Body() dto: CreateStaffDepartmentDto) {
    return this.staffMemberService.createDepartment(dto);
  }

  @Patch('departments/:id')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  updateDepartment(@Param('id') id: string, @Body() dto: UpdateStaffDepartmentDto) {
    return this.staffMemberService.updateDepartment(id, dto);
  }

  @Delete('departments/:id')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  removeDepartment(@Param('id') id: string) {
    return this.staffMemberService.removeDepartment(id);
  }

  @Get('attendance/monthly')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  listAttendance(@Query('month') month: string) {
    return this.staffMemberService.listAttendance(month);
  }

  @Put('attendance/:staffId/:date')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  upsertAttendance(
    @Param('staffId') staffId: string,
    @Param('date') date: string,
    @Body() dto: UpsertStaffAttendanceDto,
    @CurrentUser() currentUser: UserEntity,
  ) {
    return this.staffMemberService.upsertAttendance(staffId, date, dto, currentUser);
  }

  @Get('payroll/monthly')
  @RequireRoles(Roles.DIRECTOR)
  payroll(@Query('month') month: string) {
    return this.staffMemberService.payroll(month);
  }

  @Get('salary-advances/list')
  @RequireRoles(Roles.DIRECTOR)
  listSalaryAdvances(@Query('month') month?: string) { return this.staffMemberService.listSalaryAdvances(month); }

  @Get('salary-advances/summary')
  @RequireRoles(Roles.DIRECTOR)
  getSalaryAdvanceSummary(
    @Query('staff_member_id') staffMemberId: string,
    @Query('month') month: string,
  ) {
    return this.staffMemberService.getSalaryAdvanceSummary(staffMemberId, month);
  }

  @Post('salary-advances')
  @RequireRoles(Roles.DIRECTOR)
  createSalaryAdvance(@Body() dto: CreateSalaryAdvanceDto, @CurrentUser() currentUser: UserEntity) {
    return this.staffMemberService.createSalaryAdvance(dto, currentUser);
  }

  @Patch('salary-advances/:id')
  @RequireRoles(Roles.DIRECTOR)
  updateSalaryAdvance(
    @Param('id') id: string,
    @Body() dto: UpdateSalaryAdvanceDto,
    @CurrentUser() currentUser: UserEntity,
  ) {
    return this.staffMemberService.updateSalaryAdvance(id, dto, currentUser);
  }

  @Get('salary-advances/:id/history')
  @RequireRoles(Roles.DIRECTOR)
  listSalaryAdvanceHistory(@Param('id') id: string) {
    return this.staffMemberService.listSalaryAdvanceHistory(id);
  }

  @Put('payroll/:staffId/:month')
  @RequireRoles(Roles.DIRECTOR)
  upsertPayrollAdjustment(@Param('staffId') staffId: string, @Param('month') month: string, @Body() dto: UpsertPayrollAdjustmentDto) {
    return this.staffMemberService.upsertPayrollAdjustment(staffId, month, dto);
  }

  @Post('payroll/:staffId/:month/payment')
  @RequireRoles(Roles.DIRECTOR)
  createSalaryPayment(
    @Param('staffId') staffId: string,
    @Param('month') month: string,
    @Body() dto: CreateSalaryPaymentDto,
    @CurrentUser() currentUser: UserEntity,
  ) {
    return this.staffMemberService.createSalaryPayment(staffId, month, dto, currentUser);
  }

  @Get(':id')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Get Staff Members record' })
  findOne(@Param('id') id: string, @CurrentUser() currentUser: UserEntity) {
    return this.staffMemberService.findOne(id, currentUser);
  }

  @Post()
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create Staff Members record' })
  create(@Body() dto: CreateStaffMemberDto, @CurrentUser() currentUser: UserEntity) {
    return this.staffMemberService.create(dto, currentUser);
  }

  @Patch(':id')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update Staff Members record' })
  update(@Param('id') id: string, @Body() dto: UpdateStaffMemberDto, @CurrentUser() currentUser: UserEntity) {
    return this.staffMemberService.update(id, dto, currentUser);
  }

  @Delete(':id')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Delete Staff Members record' })
  async remove(@Param('id') id: string) { await this.staffMemberService.remove(id); return { success: true }; }
}
