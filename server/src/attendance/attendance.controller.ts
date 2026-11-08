import { Body, Controller, Delete, Get, Header, Headers, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { UserEntity } from '../users/user.entity';
import { getClientIp } from '../proxy.config';
import { AttendanceService } from './attendance.service';
import { AttendanceCheckDto } from './dto/attendance-check.dto';
import { CreateAttendanceLocationDto } from './dto/create-attendance-location.dto';
import { QueryAttendanceLogsDto } from './dto/query-attendance-logs.dto';
import { UpdateAttendanceLocationDto } from './dto/update-attendance-location.dto';

@ApiTags('Attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('locations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List attendance locations' })
  findLocations() {
    return this.attendanceService.findLocations();
  }

  @Post('locations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create attendance location' })
  createLocation(@Body() dto: CreateAttendanceLocationDto, @CurrentUser() user: UserEntity) {
    return this.attendanceService.createLocation(dto, user);
  }

  @Get('locations/active')
  @ApiOperation({ summary: 'List active attendance locations' })
  findActiveLocations() {
    return this.attendanceService.listActiveLocations();
  }

  @Get('network')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Detect current network and eligible IP attendance location' })
  getNetworkStatus(@Req() request: Request) {
    return this.attendanceService.getNetworkStatus(getClientIp(request));
  }

  @Put('locations/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update attendance location' })
  updateLocation(@Param('id') id: string, @Body() dto: UpdateAttendanceLocationDto) {
    return this.attendanceService.updateLocation(id, dto);
  }

  @Delete('locations/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete attendance location' })
  removeLocation(@Param('id') id: string) {
    return this.attendanceService.removeLocation(id);
  }

  @Patch('locations/:id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Toggle attendance location active state' })
  toggleLocation(@Param('id') id: string) {
    return this.attendanceService.toggleLocation(id);
  }

  @Get('logs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List attendance logs' })
  findLogs(@Query() query: QueryAttendanceLogsDto) {
    return this.attendanceService.findLogs(query);
  }

  @Post('check')
  @ApiOperation({ summary: 'Check in or check out by registered network or GPS' })
  checkAttendance(@Body() dto: AttendanceCheckDto, @CurrentUser() user: UserEntity, @Req() request: Request, @Headers('user-agent') userAgent?: string) {
    return this.attendanceService.checkAttendance(user, dto, userAgent, getClientIp(request));
  }

  @Get('my-logs')
  @ApiOperation({ summary: 'List current user attendance logs' })
  findMyLogs(@CurrentUser() user: UserEntity, @Query() query: QueryAttendanceLogsDto) {
    return this.attendanceService.findMyLogs(user, query);
  }

  @Get('today')
  @ApiOperation({ summary: 'Get current user attendance status today' })
  getTodayStatus(@CurrentUser() user: UserEntity) {
    return this.attendanceService.getTodayStatus(user);
  }
}
