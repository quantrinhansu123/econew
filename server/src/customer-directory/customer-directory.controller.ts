import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { CreateCustomerDirectoryDto } from './dto/create-customer-directory.dto';
import { QueryCustomerDirectoryDto } from './dto/query-customer-directory.dto';
import { UpdateCustomerDirectoryDto } from './dto/update-customer-directory.dto';
import { CustomerDirectoryService } from './customer-directory.service';

@ApiTags('Customer Directory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customer-directory')
export class CustomerDirectoryController {
  constructor(private readonly customerDirectoryService: CustomerDirectoryService) {}

  @Get()
  @ApiOperation({ summary: 'List Customer Directory' })
  list(@Query() query: QueryCustomerDirectoryDto) { return this.customerDirectoryService.list(query); }

  @Get(':id')
  @ApiOperation({ summary: 'Get Customer Directory record' })
  findOne(@Param('id') id: string) { return this.customerDirectoryService.findOne(id); }

  @Post()
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create Customer Directory record' })
  create(@Body() dto: CreateCustomerDirectoryDto) { return this.customerDirectoryService.create(dto); }

  @Patch(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update Customer Directory record' })
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDirectoryDto) { return this.customerDirectoryService.update(id, dto); }

  @Delete(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Delete Customer Directory record' })
  async remove(@Param('id') id: string) { await this.customerDirectoryService.remove(id); return { success: true }; }
}
