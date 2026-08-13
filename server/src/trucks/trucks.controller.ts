import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { UserEntity } from '../users/user.entity';
import { CreateTruckDto } from './dto/create-truck.dto';
import { QueryTrucksDto } from './dto/query-trucks.dto';
import { UpdateTruckStatusDto } from './dto/update-truck-status.dto';
import { UpdateTruckDto } from './dto/update-truck.dto';
import { TrucksService } from './trucks.service';

@ApiTags('Trucks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trucks')
export class TrucksController {
  constructor(private readonly trucksService: TrucksService) {}

  @Post()
  @RequireRoles(Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create a truck/BKS and optionally link it to a vendor' })
  create(@Body() dto: CreateTruckDto, @CurrentUser() currentUser: UserEntity) {
    return this.trucksService.create(dto, currentUser);
  }

  @Get()
  @RequireRoles(Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List trucks' })
  findAll(@Query() query: QueryTrucksDto, @CurrentUser() currentUser: UserEntity) {
    return this.trucksService.findAll(query, currentUser);
  }

  @Get('available')
  @RequireRoles(Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List available trucks for trips' })
  findAvailableTrucks(@Query() query: QueryTrucksDto, @CurrentUser() currentUser: UserEntity) {
    return this.trucksService.findAvailableTrucks(query, currentUser);
  }

  @Get(':id')
  @RequireRoles(Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Get truck detail' })
  findOne(@Param('id') id: string, @CurrentUser() currentUser: UserEntity) {
    return this.trucksService.findOne(id, currentUser);
  }

  @Patch(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update truck information' })
  update(@Param('id') id: string, @Body() dto: UpdateTruckDto, @CurrentUser() currentUser: UserEntity) {
    return this.trucksService.update(id, dto, currentUser);
  }

  @Patch(':id/status')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update truck status' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTruckStatusDto, @CurrentUser() currentUser: UserEntity) {
    return this.trucksService.updateStatus(id, dto, currentUser);
  }

  @Delete(':id')
  @RequireRoles(Roles.DIRECTOR)
  @ApiOperation({ summary: 'Soft delete truck' })
  softDelete(@Param('id') id: string, @CurrentUser() currentUser: UserEntity) {
    return this.trucksService.softDelete(id, currentUser);
  }
}
