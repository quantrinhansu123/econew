import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainCrudService } from '../common/domain-crud.service';
import { VehicleCostEntity } from '../vehicle-costs/vehicle-cost.entity';
import { CreateCashTransactionDetailDto } from './dto/create-cash-transaction-detail.dto';
import { UpdateCashTransactionDetailDto } from './dto/update-cash-transaction-detail.dto';
import { CashTransactionDetailEntity } from './cash-transaction-detail.entity';

@Injectable()
export class CashTransactionDetailService extends DomainCrudService<CashTransactionDetailEntity, CreateCashTransactionDetailDto, UpdateCashTransactionDetailDto, CashTransactionDetailEntity> {
  constructor(
    @InjectRepository(CashTransactionDetailEntity) private readonly cashTransactionDetailRepository: Repository<CashTransactionDetailEntity>,
    @InjectRepository(VehicleCostEntity) private readonly vehicleCostsRepository: Repository<VehicleCostEntity>,
  ) {
    super(cashTransactionDetailRepository, { alias: 'cashTransactionDetail', searchColumns: ["voucher_type","voucher_name","service_type","counterparty_unit","content","performed_by","note"], uniqueColumns: [], nullableStrings: ["note"] });
  }

  protected override async prepareCreate(dto: CreateCashTransactionDetailDto): Promise<Partial<CashTransactionDetailEntity>> {
    await this.assertVehicleCostExists(dto.vehicle_cost_id);
    return super.prepareCreate(dto);
  }

  protected override async prepareUpdate(dto: UpdateCashTransactionDetailDto, entity: CashTransactionDetailEntity): Promise<Partial<CashTransactionDetailEntity>> {
    if (dto.vehicle_cost_id !== undefined) await this.assertVehicleCostExists(dto.vehicle_cost_id);
    return super.prepareUpdate(dto, entity);
  }

  private async assertVehicleCostExists(vehicleCostId: string): Promise<void> {
    const vehicleCost = await this.vehicleCostsRepository.findOne({ where: { id: vehicleCostId } as any });
    if (!vehicleCost) throw new BadRequestException('vehicle_cost_id does not reference an existing vehicle cost');
  }
}
