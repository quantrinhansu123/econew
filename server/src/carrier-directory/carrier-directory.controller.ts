import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { CreateCarrierDirectoryDto } from './dto/create-carrier-directory.dto';
import { QueryCarrierDirectoryDto } from './dto/query-carrier-directory.dto';
import { UpdateCarrierDirectoryDto } from './dto/update-carrier-directory.dto';
import { CarrierDirectoryService } from './carrier-directory.service';

@ApiTags('Carrier Directory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('carrier-directory')
export class CarrierDirectoryController {
  constructor(private readonly carrierDirectoryService: CarrierDirectoryService) {}

  @Get()
  @ApiOperation({ summary: 'List Carrier Directory' })
  list(@Query() query: QueryCarrierDirectoryDto) { return this.carrierDirectoryService.list(query); }

  @Get(':id')
  @ApiOperation({ summary: 'Get Carrier Directory record' })
  findOne(@Param('id') id: string) { return this.carrierDirectoryService.findOne(id); }

  @Post()
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create Carrier Directory record' })
  create(@Body() dto: CreateCarrierDirectoryDto) { return this.carrierDirectoryService.create(dto); }

  @Patch(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update Carrier Directory record' })
  update(@Param('id') id: string, @Body() dto: UpdateCarrierDirectoryDto) { return this.carrierDirectoryService.update(id, dto); }

  @Delete(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Delete Carrier Directory record' })
  async remove(@Param('id') id: string) { await this.carrierDirectoryService.remove(id); return { success: true }; }
}
