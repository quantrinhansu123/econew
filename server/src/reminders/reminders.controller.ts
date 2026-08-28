import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { UserEntity } from '../users/user.entity';
import { CreateOperationalReminderDto } from './dto/create-operational-reminder.dto';
import { UpdateOperationalReminderDto } from './dto/update-operational-reminder.dto';
import { RemindersService } from './reminders.service';

@ApiTags('Operational reminders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get()
  @ApiOperation({ summary: 'List active operational reminders, due items first' })
  findActive(@CurrentUser() currentUser: UserEntity) {
    return this.remindersService.findActive(currentUser);
  }

  @Post()
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Create an operational reminder, optionally linked to an internal truck' })
  create(@Body() dto: CreateOperationalReminderDto, @CurrentUser() currentUser: UserEntity) {
    return this.remindersService.create(dto, currentUser);
  }

  @Patch(':id')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Update an active operational reminder' })
  update(@Param('id') id: string, @Body() dto: UpdateOperationalReminderDto, @CurrentUser() currentUser: UserEntity) {
    return this.remindersService.update(id, dto, currentUser);
  }

  @Patch(':id/complete')
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Mark an operational reminder as completed' })
  complete(@Param('id') id: string, @CurrentUser() currentUser: UserEntity) {
    return this.remindersService.complete(id, currentUser);
  }
}
