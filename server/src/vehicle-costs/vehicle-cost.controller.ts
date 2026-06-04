import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { CreateVehicleCostDto } from './dto/create-vehicle-cost.dto';
import { QueryVehicleCostDto } from './dto/query-vehicle-cost.dto';
import { UpdateVehicleCostDto } from './dto/update-vehicle-cost.dto';
import { VehicleCostService } from './vehicle-cost.service';

@ApiTags('Vehicle Costs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vehicle-costs')
export class VehicleCostController {
  constructor(private readonly vehicleCostService: VehicleCostService) {}

  @Get()
  @ApiOperation({ summary: 'List Vehicle Costs' })
  list(@Query() query: QueryVehicleCostDto) { return this.vehicleCostService.list(query); }

  @Get(':id')
  @ApiOperation({ summary: 'Get Vehicle Costs record' })
  findOne(@Param('id') id: string) { return this.vehicleCostService.findOne(id); }

  @Post()
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create Vehicle Costs record' })
  create(@Body() dto: CreateVehicleCostDto) { return this.vehicleCostService.create(dto); }

  @Patch(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update Vehicle Costs record' })
  update(@Param('id') id: string, @Body() dto: UpdateVehicleCostDto) { return this.vehicleCostService.update(id, dto); }

  @Delete(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Delete Vehicle Costs record' })
  async remove(@Param('id') id: string) { await this.vehicleCostService.remove(id); return { success: true }; }
}
