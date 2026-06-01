import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { CreateChanhShipmentDto } from './dto/create-chanh-shipment.dto';
import { QueryChanhShipmentDto } from './dto/query-chanh-shipment.dto';
import { UpdateChanhShipmentDto } from './dto/update-chanh-shipment.dto';
import { ChanhShipmentService } from './chanh-shipment.service';

@ApiTags('Chanh Shipments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('chanh-shipments')
export class ChanhShipmentController {
  constructor(private readonly chanhShipmentService: ChanhShipmentService) {}

  @Get()
  @ApiOperation({ summary: 'List Chanh Shipments' })
  list(@Query() query: QueryChanhShipmentDto) { return this.chanhShipmentService.list(query); }

  @Get(':id')
  @ApiOperation({ summary: 'Get Chanh Shipments record' })
  findOne(@Param('id') id: string) { return this.chanhShipmentService.findOne(id); }

  @Post()
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create Chanh Shipments record' })
  create(@Body() dto: CreateChanhShipmentDto) { return this.chanhShipmentService.create(dto); }

  @Patch(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update Chanh Shipments record' })
  update(@Param('id') id: string, @Body() dto: UpdateChanhShipmentDto) { return this.chanhShipmentService.update(id, dto); }

  @Delete(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Delete Chanh Shipments record' })
  async remove(@Param('id') id: string) { await this.chanhShipmentService.remove(id); return { success: true }; }
}
