import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, isManager } from '../common/roles';
import { AssignUserHubDto } from './dto/assign-user-hub.dto';
import { AssignUserRoleDto } from './dto/assign-user-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './user.entity';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create an internal user' })
  create(@Body() dto: CreateUserDto, @CurrentUser() currentUser: UserEntity) {
    return this.usersService.create(dto, currentUser);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List internal users with filters and pagination' })
  findAll(@Query() query: QueryUsersDto, @CurrentUser() currentUser: UserEntity) {
    return this.usersService.findAll(query, currentUser);
  }

  @Get('drivers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles(Roles.DISPATCHER, Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'List active internal drivers for trip assignment' })
  findDrivers() {
    return this.usersService.findActiveUsersByRole(Roles.DRIVER);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user details' })
  findOne(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    return this.usersService.findOne(id, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update internal user information' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() currentUser: UserEntity) {
    return this.usersService.update(id, dto, currentUser);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Activate or deactivate an internal user' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto, @CurrentUser() user: UserEntity) {
    return this.usersService.updateStatus(id, dto, user);
  }

  @Patch(':id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Assign role bitmask to an internal user' })
  assignRole(@Param('id') id: string, @Body() dto: AssignUserRoleDto, @CurrentUser() user: UserEntity) {
    return this.usersService.assignRole(id, dto, user);
  }

  @Patch(':id/hub')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Assign an internal user to a hub' })
  assignHub(@Param('id') id: string, @Body() dto: AssignUserHubDto, @CurrentUser() currentUser: UserEntity) {
    return this.usersService.assignHub(id, dto, currentUser);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireRoles(Roles.DIRECTOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete an internal user' })
  remove(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    if (!isManager(user.role_mask)) throw new ForbiddenException('Insufficient role permissions');
    return this.usersService.remove(id, user);
  }
}
