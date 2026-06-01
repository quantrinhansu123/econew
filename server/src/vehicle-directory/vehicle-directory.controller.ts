import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { CreateVehicleDirectoryDto } from './dto/create-vehicle-directory.dto';
import { QueryVehicleDirectoryDto } from './dto/query-vehicle-directory.dto';
import { UpdateVehicleDirectoryDto } from './dto/update-vehicle-directory.dto';
import { VehicleDirectoryService } from './vehicle-directory.service';

@ApiTags('Vehicle Directory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vehicle-directory')
export class VehicleDirectoryController {
  constructor(private readonly vehicleDirectoryService: VehicleDirectoryService) {}

  @Get()
  @ApiOperation({ summary: 'List Vehicle Directory' })
  list(@Query() query: QueryVehicleDirectoryDto) { return this.vehicleDirectoryService.list(query); }

  @Get(':id')
  @ApiOperation({ summary: 'Get Vehicle Directory record' })
  findOne(@Param('id') id: string) { return this.vehicleDirectoryService.findOne(id); }

  @Post()
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create Vehicle Directory record' })
  create(@Body() dto: CreateVehicleDirectoryDto) { return this.vehicleDirectoryService.create(dto); }

  @Patch(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update Vehicle Directory record' })
  update(@Param('id') id: string, @Body() dto: UpdateVehicleDirectoryDto) { return this.vehicleDirectoryService.update(id, dto); }

  @Delete(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Delete Vehicle Directory record' })
  async remove(@Param('id') id: string) { await this.vehicleDirectoryService.remove(id); return { success: true }; }
}
