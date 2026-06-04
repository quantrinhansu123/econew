import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { QueryRoutesDto } from './dto/query-routes.dto';
import { UpdateRouteStatusDto } from './dto/update-route-status.dto';
import { UpsertRouteDto } from './dto/upsert-route.dto';
import { RoutesService } from './routes.service';

@ApiTags('Routes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @RequireRoles(Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Tạo tuyến giao mới' })
  create(@Body() dto: UpsertRouteDto) {
    return this.routesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Danh mục tuyến giao — lọc & phân trang' })
  findAll(@Query() query: QueryRoutesDto) {
    return this.routesService.findAll(query);
  }

  @Get('active')
  @ApiOperation({ summary: 'Tuyến đang hoạt động — dùng cho combobox gán tuyến' })
  findActive(@Query('hub_id') hubId?: string) {
    return this.routesService.findActive(hubId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết tuyến' })
  findOne(@Param('id') id: string) {
    return this.routesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @RequireRoles(Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Cập nhật tuyến giao' })
  update(@Param('id') id: string, @Body() dto: UpsertRouteDto) {
    return this.routesService.update(id, dto);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @RequireRoles(Roles.DISPATCHER, Roles.MANAGER, Roles.DIRECTOR)
  @ApiOperation({ summary: 'Bật/tắt tuyến giao' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateRouteStatusDto) {
    return this.routesService.updateStatus(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @RequireRoles(Roles.MANAGER, Roles.DIRECTOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa tuyến (chỉ khi chưa có vận đơn gán)' })
  remove(@Param('id') id: string) {
    return this.routesService.remove(id);
  }
}
