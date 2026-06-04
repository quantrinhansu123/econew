import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { CreateNorthSouthShipmentDto } from './dto/create-north-south-shipment.dto';
import { QueryNorthSouthShipmentDto } from './dto/query-north-south-shipment.dto';
import { UpdateNorthSouthShipmentDto } from './dto/update-north-south-shipment.dto';
import { NorthSouthShipmentService } from './north-south-shipment.service';

@ApiTags('North South Shipments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('north-south-shipments')
export class NorthSouthShipmentController {
  constructor(private readonly northSouthShipmentService: NorthSouthShipmentService) {}

  @Get()
  @ApiOperation({ summary: 'List North South Shipments' })
  list(@Query() query: QueryNorthSouthShipmentDto) { return this.northSouthShipmentService.list(query); }

  @Get(':id')
  @ApiOperation({ summary: 'Get North South Shipments record' })
  findOne(@Param('id') id: string) { return this.northSouthShipmentService.findOne(id); }

  @Post()
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create North South Shipments record' })
  create(@Body() dto: CreateNorthSouthShipmentDto) { return this.northSouthShipmentService.create(dto); }

  @Patch(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update North South Shipments record' })
  update(@Param('id') id: string, @Body() dto: UpdateNorthSouthShipmentDto) { return this.northSouthShipmentService.update(id, dto); }

  @Delete(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Delete North South Shipments record' })
  async remove(@Param('id') id: string) { await this.northSouthShipmentService.remove(id); return { success: true }; }
}
