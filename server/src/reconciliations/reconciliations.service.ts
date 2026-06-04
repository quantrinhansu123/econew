import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, LessThan, Repository } from 'typeorm';
import { RemittanceStatus } from '../common/enums';
import { clampPaginationLimit } from '../common/pagination';
import { Roles, hasRole, isManager } from '../common/roles';
import { HubEntity } from '../hubs/hub.entity';
import { UserEntity } from '../users/user.entity';
import { CreateReconciliationDto } from './dto/create-reconciliation.dto';
import { QueryReconciliationsDto } from './dto/query-reconciliations.dto';
import { RemitReconciliationDto } from './dto/remit-reconciliation.dto';
import { UpdateReconciliationDto } from './dto/update-reconciliation.dto';
import { ReconciliationEntity } from './reconciliation.entity';

const FULL_RECONCILIATION_VIEW_ROLES = [Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR];

@Injectable()
export class ReconciliationsService {
  constructor(
    @InjectRepository(ReconciliationEntity) private readonly reconciliationsRepository: Repository<ReconciliationEntity>,
    @InjectRepository(HubEntity) private readonly hubsRepository: Repository<HubEntity>,
  ) {}

  async create(dto: CreateReconciliationDto, currentUser: UserEntity): Promise<ReconciliationEntity> {
    this.assertNonNegative(dto.cod_cash_held, dto.cc_cash_held, dto.total_remitted);
    this.assertNotFutureDate(dto.reconciliation_date);
    const hub = await this.hubsRepository.findOne({ where: { id: String(dto.hub_id) } });
    if (!hub) throw new NotFoundException('Hub not found');
    const existing = await this.reconciliationsRepository.findOne({ where: { hub_id: String(dto.hub_id), reconciliation_date: dto.reconciliation_date } });
    if (existing) throw new ConflictException('Reconciliation already exists for this hub and date');
    const reconciliation = this.reconciliationsRepository.create({
      hub_id: String(dto.hub_id),
      reconciliation_date: dto.reconciliation_date,
      cod_cash_held: String(dto.cod_cash_held),
      cc_cash_held: String(dto.cc_cash_held),
      total_remitted: String(dto.total_remitted),
      remittance_status: RemittanceStatus.PENDING,
      remitted_at: null,
    });
    return this.reconciliationsRepository.save(reconciliation);
  }

  async findAll(query: QueryReconciliationsDto, currentUser: UserEntity) {
    const page = query.page ?? 1;
    const limit = clampPaginationLimit(query.limit, 10);
    const qb = this.reconciliationsRepository.createQueryBuilder('reconciliation')
      .leftJoinAndSelect('reconciliation.hub', 'hub')
      .orderBy('reconciliation.reconciliation_date', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.hub_id) qb.andWhere('reconciliation.hub_id = :hubId', { hubId: String(query.hub_id) });
    if (query.remittance_status) qb.andWhere('reconciliation.remittance_status = :status', { status: query.remittance_status });
    if (query.date_from) qb.andWhere('reconciliation.reconciliation_date >= :dateFrom', { dateFrom: query.date_from });
    if (query.date_to) qb.andWhere('reconciliation.reconciliation_date <= :dateTo', { dateTo: query.date_to });
    this.applyHubScope(qb, currentUser);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string, currentUser: UserEntity): Promise<ReconciliationEntity> {
    const qb = this.reconciliationsRepository.createQueryBuilder('reconciliation')
      .leftJoinAndSelect('reconciliation.hub', 'hub')
      .where('reconciliation.id = :id', { id });
    this.applyHubScope(qb, currentUser);
    const reconciliation = await qb.getOne();
    if (!reconciliation) throw new NotFoundException('Reconciliation not found');
    return reconciliation;
  }

  async update(id: string, dto: UpdateReconciliationDto, currentUser: UserEntity): Promise<ReconciliationEntity> {
    this.assertNonNegative(dto.cod_cash_held, dto.cc_cash_held, dto.total_remitted);
    const reconciliation = await this.findOne(id, currentUser);
    if (reconciliation.remittance_status !== RemittanceStatus.PENDING) throw new BadRequestException('Only PENDING reconciliations can be updated');
    if (dto.cod_cash_held !== undefined) reconciliation.cod_cash_held = String(dto.cod_cash_held);
    if (dto.cc_cash_held !== undefined) reconciliation.cc_cash_held = String(dto.cc_cash_held);
    if (dto.total_remitted !== undefined) reconciliation.total_remitted = String(dto.total_remitted);
    return this.reconciliationsRepository.save(reconciliation);
  }

  async remit(id: string, dto: RemitReconciliationDto, currentUser: UserEntity): Promise<ReconciliationEntity> {
    const reconciliation = await this.findOne(id, currentUser);
    if (reconciliation.remittance_status === RemittanceStatus.REMITTED) throw new BadRequestException('Reconciliation is already remitted');
    if (![RemittanceStatus.PENDING, RemittanceStatus.OVERDUE].includes(reconciliation.remittance_status)) throw new BadRequestException('Only PENDING or OVERDUE reconciliations can be remitted');
    if (Number(reconciliation.total_remitted ?? 0) <= 0) throw new BadRequestException('Total remitted must be greater than 0');
    reconciliation.remittance_status = RemittanceStatus.REMITTED;
    reconciliation.remitted_at = dto.remitted_at ? new Date(dto.remitted_at) : new Date();
    return this.reconciliationsRepository.save(reconciliation);
  }

  // TODO: Register a daily 00:01 @Cron caller after @nestjs/schedule is installed.
  async markOverdue(currentUser: UserEntity): Promise<{ updated_count: number }> {
    if (!isManager(currentUser.role_mask)) throw new ForbiddenException('Manager or Director role required');
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 1);
    const overdueBefore = threshold.toISOString().slice(0, 10);
    const records = await this.reconciliationsRepository.find({ where: { remittance_status: RemittanceStatus.PENDING, reconciliation_date: LessThan(overdueBefore) } });
    records.forEach((record) => { record.remittance_status = RemittanceStatus.OVERDUE; });
    if (records.length) await this.reconciliationsRepository.save(records);
    return { updated_count: records.length };
  }

  async getHubSummary(hubId: string, currentUser: UserEntity) {
    const hub = await this.hubsRepository.findOne({ where: { id: hubId } });
    if (!hub) throw new NotFoundException('Hub not found');
    this.assertHubAccess(hubId, currentUser);
    const records = await this.reconciliationsRepository.find({ where: { hub_id: hubId } });
    const active = records.filter((record) => [RemittanceStatus.PENDING, RemittanceStatus.OVERDUE].includes(record.remittance_status));
    const monthPrefix = new Date().toISOString().slice(0, 7);
    const remittedThisMonth = records.filter((record) => record.remittance_status === RemittanceStatus.REMITTED && record.reconciliation_date.startsWith(monthPrefix));
    return {
      hub_id: hub.id,
      hub_name: hub.name,
      pending_cod: active.reduce((sum, record) => sum + Number(record.cod_cash_held ?? 0), 0),
      pending_cc: active.reduce((sum, record) => sum + Number(record.cc_cash_held ?? 0), 0),
      remitted_this_month: remittedThisMonth.reduce((sum, record) => sum + Number(record.total_remitted ?? 0), 0),
      overdue_count: records.filter((record) => record.remittance_status === RemittanceStatus.OVERDUE).length,
    };
  }

  async remove(id: string, currentUser: UserEntity): Promise<void> {
    if (!hasRole(currentUser.role_mask, Roles.DIRECTOR)) throw new ForbiddenException('Director role required');
    const reconciliation = await this.findOne(id, currentUser);
    if (reconciliation.remittance_status === RemittanceStatus.REMITTED) throw new BadRequestException('Cannot delete remitted reconciliation');
    await this.reconciliationsRepository.remove(reconciliation);
  }

  private applyHubScope(qb: any, currentUser: UserEntity): void {
    if (FULL_RECONCILIATION_VIEW_ROLES.some((role) => hasRole(currentUser.role_mask, role))) return;
    if (!currentUser.hub_id) return;
    qb.andWhere(new Brackets((inner) => {
      inner.where('reconciliation.hub_id = :userHubId', { userHubId: currentUser.hub_id });
    }));
  }

  private assertHubAccess(hubId: string, currentUser: UserEntity): void {
    if (FULL_RECONCILIATION_VIEW_ROLES.some((role) => hasRole(currentUser.role_mask, role))) return;
    if (currentUser.hub_id !== hubId) throw new NotFoundException('Hub not found');
  }

  private assertNonNegative(...values: Array<number | undefined>): void {
    if (values.some((value) => value !== undefined && value < 0)) throw new BadRequestException('Amounts must not be negative');
  }

  private assertNotFutureDate(date: string): void {
    const today = new Date().toISOString().slice(0, 10);
    if (date > today) throw new BadRequestException('Reconciliation date cannot be in the future');
  }
}
