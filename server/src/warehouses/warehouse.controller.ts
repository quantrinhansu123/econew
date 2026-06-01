import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { QueryWarehouseDto } from './dto/query-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseService } from './warehouse.service';

@ApiTags('Warehouses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('warehouses')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Get()
  @ApiOperation({ summary: 'List Warehouses' })
  list(@Query() query: QueryWarehouseDto) { return this.warehouseService.list(query); }

  @Get(':id')
  @ApiOperation({ summary: 'Get Warehouses record' })
  findOne(@Param('id') id: string) { return this.warehouseService.findOne(id); }

  @Post()
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create Warehouses record' })
  create(@Body() dto: CreateWarehouseDto) { return this.warehouseService.create(dto); }

  @Patch(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update Warehouses record' })
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) { return this.warehouseService.update(id, dto); }

  @Delete(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Delete Warehouses record' })
  async remove(@Param('id') id: string) { await this.warehouseService.remove(id); return { success: true }; }
}
