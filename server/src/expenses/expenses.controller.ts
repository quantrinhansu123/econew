import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { UserEntity } from '../users/user.entity';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpensesService } from './expenses.service';

@ApiTags('Expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @RequireRoles(Roles.WAREHOUSE, Roles.DISPATCHER, Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create a trip expense' })
  create(@Body() dto: CreateExpenseDto, @CurrentUser() currentUser: UserEntity) {
    return this.expensesService.create(dto, currentUser);
  }

  @Get()
  @RequireRoles(Roles.ACCOUNTANT, Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List trip expenses' })
  findAll(@Query() query: QueryExpensesDto, @CurrentUser() currentUser: UserEntity) {
    return this.expensesService.findAll(query, currentUser);
  }

  @Get('trip/:tripId')
  @RequireRoles(Roles.WAREHOUSE, Roles.PACKER, Roles.ACCOUNTANT, Roles.DISPATCHER, Roles.DRIVER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List expenses by trip' })
  findByTrip(@Param('tripId') tripId: string, @CurrentUser() currentUser: UserEntity) {
    return this.expensesService.findByTrip(tripId, currentUser);
  }

  @Get(':id')
  @RequireRoles(Roles.WAREHOUSE, Roles.PACKER, Roles.ACCOUNTANT, Roles.DISPATCHER, Roles.DRIVER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Get expense detail' })
  findOne(@Param('id') id: string, @CurrentUser() currentUser: UserEntity) {
    return this.expensesService.findOne(id, currentUser);
  }

  @Patch(':id')
  @RequireRoles(Roles.WAREHOUSE, Roles.DISPATCHER, Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update a trip expense' })
  update(@Param('id') id: string, @Body() dto: UpdateExpenseDto, @CurrentUser() currentUser: UserEntity) {
    return this.expensesService.update(id, dto, currentUser);
  }

  @Delete(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Delete a trip expense' })
  remove(@Param('id') id: string, @CurrentUser() currentUser: UserEntity) {
    return this.expensesService.remove(id, currentUser);
  }
}
