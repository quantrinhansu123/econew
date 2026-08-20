import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { UserEntity } from '../users/user.entity';
import { CreateExpenseCategoryDto, UpdateExpenseCategoryDto } from './dto/upsert-expense-category.dto';
import { ExpenseCategoriesService } from './expense-categories.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly service: ExpenseCategoriesService) {}

  @Get()
  @RequireRoles(Roles.WAREHOUSE, Roles.PACKER, Roles.DRIVER, Roles.DISPATCHER, Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  list(@Query('include_inactive') includeInactive?: string) {
    return this.service.list(includeInactive === 'true');
  }

  @Post()
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  create(@Body() dto: CreateExpenseCategoryDto, @CurrentUser() currentUser: UserEntity) {
    return this.service.create(dto, currentUser);
  }

  @Patch(':id')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  update(@Param('id') id: string, @Body() dto: UpdateExpenseCategoryDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
