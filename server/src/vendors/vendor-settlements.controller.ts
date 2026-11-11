import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/roles';
import { UserEntity } from '../users/user.entity';
import { CreateVendorPaymentDto } from './dto/create-vendor-payment.dto';
import { AllocateVendorSettlementPaymentDto, CreateVendorSettlementDto } from './dto/create-vendor-settlement.dto';
import { VendorSettlementsService } from './vendor-settlements.service';

@Controller('vendors/:vendorId/settlements')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles(Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR)
export class VendorSettlementsController {
  constructor(private readonly settlements: VendorSettlementsService) {}

  @Get()
  list(@Param('vendorId') vendorId: string, @CurrentUser() user: UserEntity) {
    return this.settlements.list(vendorId, user);
  }

  @Post()
  create(@Param('vendorId') vendorId: string, @Body() dto: CreateVendorSettlementDto, @CurrentUser() user: UserEntity) {
    return this.settlements.create(vendorId, dto, user);
  }

  @Get('unallocated-payments')
  unallocated(@Param('vendorId') vendorId: string, @CurrentUser() user: UserEntity) {
    return this.settlements.unallocatedPayments(vendorId, user);
  }

  @Get('preview')
  preview(@Param('vendorId') vendorId: string, @Query() dto: CreateVendorSettlementDto, @CurrentUser() user: UserEntity) {
    return this.settlements.preview(vendorId, dto, user);
  }

  @Post(':periodId/payments')
  pay(@Param('vendorId') vendorId: string, @Param('periodId') periodId: string, @Body() dto: CreateVendorPaymentDto, @CurrentUser() user: UserEntity) {
    return this.settlements.pay(vendorId, periodId, dto, user);
  }

  @Post(':periodId/payments/:paymentId/allocate')
  attach(@Param('vendorId') vendorId: string, @Param('periodId') periodId: string, @Param('paymentId') paymentId: string,
    @Body() dto: AllocateVendorSettlementPaymentDto, @CurrentUser() user: UserEntity) {
    return this.settlements.attach(vendorId, periodId, paymentId, dto.amount, user);
  }
}
