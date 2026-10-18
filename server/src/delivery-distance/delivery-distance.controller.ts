import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { DeliveryDistanceService } from './delivery-distance.service';
import { EstimateDeliveryDistanceDto } from './dto/estimate-delivery-distance.dto';

@ApiTags('Delivery distance')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles(Roles.WAREHOUSE, Roles.MANAGER, Roles.DIRECTOR)
@Controller('delivery-distance')
export class DeliveryDistanceController {
  constructor(private readonly service: DeliveryDistanceService) {}

  @Get('usage')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Hạn mức HERE theo tháng UTC, không gọi API bản đồ' })
  getUsage() { return this.service.getUsage(); }

  @Post('estimate')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Ước tính đường ô tô bằng HERE, chặn trước khi vượt hạn mức miễn phí' })
  estimate(@Body() dto: EstimateDeliveryDistanceDto) { return this.service.estimate(dto); }
}
