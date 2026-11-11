import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { PaymentType, RemittanceStatus } from '../common/enums';
import { Roles, hasRole, isManager } from '../common/roles';
import { getAssignedHubIds, getDefaultHubId } from '../common/user-hub-scope';
import { HubEntity } from '../hubs/hub.entity';
import { TripEntity } from '../trips/trip.entity';
import { UserEntity } from '../users/user.entity';
import { WaybillEntity } from '../waybills/waybill.entity';
import { CashFundEntity } from './cash-fund.entity';
import { ApproveInternalCostDto } from './dto/approve-internal-cost.dto';
import { ApproveVendorCostDto } from './dto/approve-vendor-cost.dto';
import { CodReconciliationQueryDto } from './dto/cod-reconciliation-query.dto';
import { CreateCashFundDto } from './dto/create-cash-fund.dto';
import { CreateReconciliationDto } from './dto/create-reconciliation.dto';
import { HubReconciliationQueryDto } from './dto/hub-reconciliation-query.dto';
import { QueryCashFundsDto } from './dto/query-cash-funds.dto';
import { QueryHubCodWaybillsDto } from './dto/query-hub-cod-waybills.dto';
import { QueryReconciliationsDto } from './dto/query-reconciliations.dto';
import { UpdateCashFundDto } from './dto/update-cash-fund.dto';
import { UpdateReconciliationDto } from './dto/update-reconciliation.dto';
import { UpdateRemittanceStatusDto } from './dto/update-remittance-status.dto';
import { FinanceReconciliationEntity } from './reconciliation.entity';

type Scope = { hubId?: string; canViewSystem: boolean; canViewProfit: boolean };
type Paginated<T> = { items: T[]; meta: { total: number; page: number; limit: number; total_pages: number } };
type RawFinance = { hub_id?: string; reconciliation_date?: string; remittance_status?: string; cod?: string; cc?: string; remitted?: string; total?: string; amount?: string; remaining?: string };

const resolveWaybillPaymentMethod = (note: unknown, paymentType: unknown): string => {
  const method = String(note || '').match(/(?:^|\|)\s*phuong_thuc=([^|]+)/i)?.[1]?.trim();
  if (method) return method;
  const normalizedType = String(paymentType || '').trim().toUpperCase();
  if (normalizedType === PaymentType.COD) return 'COD';
  if (normalizedType === PaymentType.CC) return 'Người nhận thanh toán';
  if (normalizedType === PaymentType.PP) return 'Công nợ';
  return normalizedType;
};

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(FinanceReconciliationEntity) private readonly reconciliationsRepository: Repository<FinanceReconciliationEntity>,
    @InjectRepository(HubEntity) private readonly hubsRepository: Repository<HubEntity>,
    @InjectRepository(TripEntity) private readonly tripsRepository: Repository<TripEntity>,
    @InjectRepository(WaybillEntity) private readonly waybillsRepository: Repository<WaybillEntity>,
    @InjectRepository(CashFundEntity) private readonly cashFundsRepository: Repository<CashFundEntity>,
  ) {}

  async findCashFunds(query: QueryCashFundsDto, currentUser: UserEntity): Promise<Record<string, unknown>[]> {
    this.assertFinanceRole(currentUser);
    if (query.hub_id) {
      await this.assertHubExists(query.hub_id, false);
      this.assertHubAccess(query.hub_id, currentUser);
    }

    const qb = this.cashFundsRepository.createQueryBuilder('fund')
      .leftJoinAndSelect('fund.hub', 'hub')
      .orderBy('fund.is_active', 'DESC')
      .addOrderBy('fund.code', 'ASC');
    if (!query.include_inactive) qb.andWhere('fund.is_active = true');
    if (query.hub_id) qb.andWhere('(fund.hub_id = :hubId OR fund.hub_id IS NULL)', { hubId: query.hub_id });

    const funds = await qb.getMany();
    if (!funds.length) return [];
    const balances = await this.cashFundsRepository.query(`
      SELECT movement.fund_id, COALESCE(SUM(movement.amount), 0) AS balance, COUNT(*)::int AS collection_count
      FROM (
        SELECT voucher.fund_id,
          CASE WHEN LOWER(voucher.voucher_type) = 'thu' THEN voucher.amount ELSE -voucher.amount END AS amount
        FROM waybill_cash_vouchers voucher
        WHERE voucher.fund_id = ANY($1::bigint[]) AND voucher.journal_entry_id IS NULL

        UNION ALL

        SELECT payment.fund_id, -payment.amount AS amount
        FROM vendor_payments payment
        WHERE payment.fund_id = ANY($1::bigint[])

        UNION ALL

        SELECT journal.fund_id, journal.income_amount - journal.expense_amount AS amount
        FROM cash_journal_entries journal
        WHERE journal.fund_id = ANY($1::bigint[])

        UNION ALL

        SELECT expense.fund_id, -expense.amount AS amount
        FROM expenses expense
        WHERE expense.fund_id = ANY($1::bigint[])

        UNION ALL

        SELECT transfer_out.from_fund_id AS fund_id, -transfer_out.amount AS amount
        FROM cash_fund_transfers transfer_out
        WHERE transfer_out.from_fund_id = ANY($1::bigint[])

        UNION ALL

        SELECT transfer_in.to_fund_id AS fund_id, transfer_in.amount AS amount
        FROM cash_fund_transfers transfer_in
        WHERE transfer_in.to_fund_id = ANY($1::bigint[])
      ) movement
      GROUP BY movement.fund_id
    `, [funds.map((fund) => String(fund.id))]) as Array<{ fund_id: string; balance: string; collection_count: string }>;
    const balanceByFund = new Map(balances.map((row) => [String(row.fund_id), row]));
    return funds.map((fund) => {
      const balance = balanceByFund.get(String(fund.id));
      const openingBalance = Number((fund as any).opening_balance ?? 0);
      return {
        ...fund,
        opening_balance: openingBalance,
        balance_amount: openingBalance + Number(balance?.balance ?? 0),
        collection_count: Number(balance?.collection_count ?? 0),
      };
    });
  }

  async createCashFund(dto: CreateCashFundDto, currentUser: UserEntity): Promise<Record<string, unknown>> {
    this.assertFinanceRole(currentUser);
    const code = dto.code.trim().toUpperCase();
    const name = dto.name.trim();
    const hubId = dto.hub_id?.trim() || null;
    if (!code || !name) throw new BadRequestException('Mã quỹ và tên sổ quỹ là bắt buộc');
    if (hubId) {
      await this.assertHubExists(hubId, true);
      this.assertHubAccess(hubId, currentUser);
    }
    if (await this.cashFundsRepository.findOne({ where: { code } })) {
      throw new ConflictException(`Mã quỹ ${code} đã tồn tại`);
    }
    const fund = this.cashFundsRepository.create({
      code,
      name,
      hub_id: hubId,
      is_active: dto.is_active ?? true,
      opening_balance: String(Number(dto.opening_balance ?? 0)),
      note: dto.note?.trim() || null,
      created_by: currentUser.id,
    });
    return this.sanitizeCashFund(await this.cashFundsRepository.save(fund));
  }

  async updateCashFund(id: string, dto: UpdateCashFundDto, currentUser: UserEntity): Promise<Record<string, unknown>> {
    this.assertFinanceRole(currentUser);
    const fund = await this.cashFundsRepository.findOne({ where: { id }, relations: ['hub'] });
    if (!fund) throw new NotFoundException('Không tìm thấy sổ quỹ');
    if (fund.hub_id) this.assertHubAccess(fund.hub_id, currentUser);

    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();
      if (!code) throw new BadRequestException('Mã quỹ là bắt buộc');
      const duplicate = await this.cashFundsRepository.findOne({ where: { code } });
      if (duplicate && String(duplicate.id) !== String(id)) throw new ConflictException(`Mã quỹ ${code} đã tồn tại`);
      fund.code = code;
    }
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Tên sổ quỹ là bắt buộc');
      fund.name = name;
    }
    if (dto.hub_id !== undefined) {
      const hubId = dto.hub_id.trim() || null;
      if (hubId) {
        await this.assertHubExists(hubId, true);
        this.assertHubAccess(hubId, currentUser);
      }
      fund.hub_id = hubId;
    }
    if (dto.is_active !== undefined) fund.is_active = dto.is_active;
    if (dto.opening_balance !== undefined) fund.opening_balance = String(Number(dto.opening_balance));
    if (dto.note !== undefined) fund.note = dto.note.trim() || null;
    return this.sanitizeCashFund(await this.cashFundsRepository.save(fund));
  }

  async getHubCodWaybills(query: QueryHubCodWaybillsDto, currentUser: UserEntity): Promise<Paginated<Record<string, unknown>>> {
    this.assertFinanceRole(currentUser);
    this.validateDateRange(query.date_from, query.date_to);
    if (query.hub_id) {
      await this.assertHubExists(query.hub_id, false);
      this.assertHubAccess(query.hub_id, currentUser);
    }
    const page = query.page ?? 1;
    const limit = this.resolveLimit(query.limit ?? 20);
    const receiverPaidFreightSql = `CASE
      WHEN COALESCE(waybill.cc_amount, 0) > 0 THEN waybill.cc_amount
      WHEN waybill.payment_type = 'CC' THEN COALESCE(waybill.freight_amount, waybill.cost_amount, 0)
      ELSE 0
    END`;
    const collectAmountSql = `(COALESCE(waybill.cod_amount, 0) + (${receiverPaidFreightSql}))`;
    const qb = this.waybillsRepository.createQueryBuilder('waybill')
      .leftJoin('hubs', 'origin_hub', 'origin_hub.id = waybill.origin_hub_id')
      .leftJoin('hubs', 'dest_hub', 'dest_hub.id = waybill.dest_hub_id')
      .leftJoin('cash_funds', 'fund', 'fund.id = waybill.cod_fund_id')
      .leftJoin(
        'waybill_splits',
        'latest_split',
        `latest_split.id = (
          SELECT split_lookup.id
          FROM waybill_splits split_lookup
          WHERE split_lookup.waybill_id = waybill.id AND split_lookup.trip_id IS NOT NULL
          ORDER BY split_lookup.created_at DESC, split_lookup.id DESC
          LIMIT 1
        )`,
      )
      .leftJoin('trips', 'trip', 'trip.id = latest_split.trip_id')
      .leftJoin('manifests', 'manifest', 'manifest.id = trip.manifest_id')
      .where('waybill.deleted_at IS NULL')
      .andWhere('waybill.current_state <> :cancelledStatus', { cancelledStatus: 'CANCELLED' })
      .andWhere(`${collectAmountSql} > 0`);

    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      qb.andWhere(new Brackets((builder) => builder
        .where('waybill.waybill_code ILIKE :keyword', { keyword })
        .orWhere('waybill.ma_kh ILIKE :keyword', { keyword })
        .orWhere('waybill.sender_info ILIKE :keyword', { keyword })
        .orWhere('waybill.receiver_info ILIKE :keyword', { keyword })
        .orWhere('manifest.manifest_code ILIKE :keyword', { keyword })
        .orWhere('CAST(trip.id AS TEXT) ILIKE :keyword', { keyword })
        .orWhere('fund.code ILIKE :keyword', { keyword })));
    }
    if (query.collection_status === 'PENDING') qb.andWhere('waybill.cod_reconciled_at IS NULL');
    if (query.collection_status === 'COLLECTED') qb.andWhere('waybill.cod_reconciled_at IS NOT NULL');
    if (query.date_from) qb.andWhere('COALESCE(waybill.sent_date, waybill.created_at::date) >= :dateFrom', { dateFrom: query.date_from });
    if (query.date_to) qb.andWhere('COALESCE(waybill.sent_date, waybill.created_at::date) <= :dateTo', { dateTo: query.date_to });
    // COD is collected and held by the destination hub. Do not use the
    // generic origin/current/destination scope here: that made an origin
    // hub's users appear as collectors and let the same bill surface in the
    // wrong hub statement.
    if (query.hub_id) {
      qb.andWhere('waybill.dest_hub_id = :codDestinationHubId', { codDestinationHubId: String(query.hub_id) });
    } else if (!isManager(currentUser.role_mask)) {
      const assignedHubIds = getAssignedHubIds(currentUser);
      if (!assignedHubIds.length) throw new ForbiddenException('User is not assigned to a destination hub');
      qb.andWhere('waybill.dest_hub_id IN (:...codDestinationHubIds)', { codDestinationHubIds: assignedHubIds });
    }

    const total = await qb.clone().getCount();
    const rawItems = await qb
      .select('waybill.id', 'id')
      .addSelect('waybill.waybill_code', 'waybill_code')
      .addSelect('waybill.ma_kh', 'ma_kh')
      .addSelect('waybill.sender_info', 'sender_info')
      .addSelect('waybill.receiver_info', 'receiver_info')
      .addSelect('waybill.origin_hub_id', 'origin_hub_id')
      .addSelect('waybill.dest_hub_id', 'dest_hub_id')
      .addSelect('origin_hub.code', 'origin_hub_code')
      .addSelect('origin_hub.name', 'origin_hub_name')
      .addSelect('dest_hub.code', 'dest_hub_code')
      .addSelect('dest_hub.name', 'dest_hub_name')
      .addSelect('dest_hub.id', 'collector_hub_id')
      .addSelect('dest_hub.code', 'collector_hub_code')
      .addSelect('dest_hub.name', 'collector_hub_name')
      .addSelect('dest_hub.id', 'holder_hub_id')
      .addSelect('dest_hub.code', 'holder_hub_code')
      .addSelect('dest_hub.name', 'holder_hub_name')
      .addSelect('waybill.current_state', 'current_state')
      .addSelect('waybill.payment_type', 'payment_type')
      .addSelect('waybill.note', 'payment_note_source')
      .addSelect('COALESCE(waybill.sent_date, waybill.created_at::date)', 'sent_date')
      .addSelect('COALESCE(waybill.delivered_at, waybill.delivery_time)', 'delivered_at')
      .addSelect('waybill.freight_amount', 'freight_amount')
      .addSelect('waybill.cod_amount', 'cod_amount')
      .addSelect(receiverPaidFreightSql, 'cc_amount')
      .addSelect(collectAmountSql, 'collect_amount')
      .addSelect('waybill.cod_collected_amount', 'cod_collected_amount')
      .addSelect('waybill.cod_reconciled_at', 'cod_reconciled_at')
      .addSelect('waybill.cod_reconciled_by', 'cod_reconciled_by')
      .addSelect('trip.id', 'trip_id')
      .addSelect('trip.status', 'trip_status')
      .addSelect('manifest.id', 'manifest_id')
      .addSelect('manifest.manifest_code', 'manifest_code')
      .addSelect('fund.id', 'fund_id')
      .addSelect('fund.code', 'fund_code')
      .addSelect('fund.name', 'fund_name')
      .addSelect(`(
        SELECT cod_voucher.note
        FROM waybill_cash_vouchers cod_voucher
        WHERE cod_voucher.waybill_id = waybill.id
          AND cod_voucher.source_type = 'COD_COLLECTION'
        ORDER BY cod_voucher.updated_at DESC, cod_voucher.id DESC
        LIMIT 1
      )`, 'cod_collection_note')
      .orderBy('waybill.cod_reconciled_at', 'ASC', 'NULLS FIRST')
      .addOrderBy('COALESCE(waybill.sent_date, waybill.created_at::date)', 'DESC')
      .addOrderBy('waybill.id', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<Record<string, unknown>>();

    return this.paginate(rawItems.map((rawItem) => {
      const { payment_note_source: paymentNoteSource, ...item } = rawItem;
      return {
        ...item,
        payment_method: resolveWaybillPaymentMethod(paymentNoteSource, item.payment_type),
        freight_amount: Number(item.freight_amount ?? 0),
        cod_amount: Number(item.cod_amount ?? 0),
        cc_amount: Number(item.cc_amount ?? 0),
        collect_amount: Number(item.collect_amount ?? 0),
        cod_collected_amount: Number(item.cod_collected_amount ?? 0),
        cod_collection_status: item.cod_reconciled_at ? 'COLLECTED' : 'PENDING',
      };
    }), total, page, limit);
  }

  async createReconciliation(dto: CreateReconciliationDto, currentUser: UserEntity): Promise<Record<string, unknown>> {
    this.assertFinanceRole(currentUser);
    this.assertNonNegative(dto.cod_cash_held, dto.cc_cash_held, dto.total_remitted);
    this.validateReconciliationDate(dto.reconciliation_date);
    await this.assertHubExists(dto.hub_id, true);
    this.assertHubAccess(dto.hub_id, currentUser);
    const duplicate = await this.reconciliationsRepository.findOne({ where: { hub_id: dto.hub_id, reconciliation_date: dto.reconciliation_date } });
    if (duplicate) throw new ConflictException('Reconciliation already exists for hub and date');
    const reconciliation = this.reconciliationsRepository.create({
      hub_id: dto.hub_id,
      reconciliation_date: dto.reconciliation_date,
      cod_cash_held: String(dto.cod_cash_held),
      cc_cash_held: String(dto.cc_cash_held),
      total_remitted: String(dto.total_remitted),
      remittance_status: this.resolveRemittanceStatus(dto.cod_cash_held, dto.cc_cash_held, dto.total_remitted),
    });
    return this.sanitizeReconciliation(await this.reconciliationsRepository.save(reconciliation), currentUser);
  }

  async findReconciliations(query: QueryReconciliationsDto, currentUser: UserEntity): Promise<Paginated<Record<string, unknown>>> {
    this.assertFinanceRole(currentUser);
    const normalized = await this.normalizeQuery(query, currentUser);
    const page = normalized.page ?? 1;
    const limit = this.resolveLimit(normalized.limit);
    const qb = this.buildReconciliationQuery(normalized, currentUser)
      .leftJoinAndSelect('reconciliation.hub', 'hub')
      .select(['reconciliation.id', 'reconciliation.hub_id', 'reconciliation.reconciliation_date', 'reconciliation.cod_cash_held', 'reconciliation.cc_cash_held', 'reconciliation.total_remitted', 'reconciliation.remittance_status', 'reconciliation.remitted_at', 'hub.id', 'hub.code', 'hub.name'])
      .orderBy('reconciliation.reconciliation_date', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    return this.paginate(items.map((item) => this.sanitizeReconciliation(item, currentUser)), total, page, limit);
  }

  async findReconciliationById(id: string, currentUser: UserEntity): Promise<Record<string, unknown>> {
    this.assertFinanceRole(currentUser);
    const qb = this.reconciliationsRepository.createQueryBuilder('reconciliation')
      .leftJoinAndSelect('reconciliation.hub', 'hub')
      .where('reconciliation.id = :id', { id });
    this.applyReconciliationScope(qb, currentUser);
    const reconciliation = await qb.getOne();
    if (!reconciliation) throw new NotFoundException('Reconciliation not found');
    return this.sanitizeReconciliation(reconciliation, currentUser);
  }

  async updateReconciliation(id: string, dto: UpdateReconciliationDto, currentUser: UserEntity): Promise<Record<string, unknown>> {
    this.assertFinanceRole(currentUser);
    this.assertNonNegative(dto.cod_cash_held, dto.cc_cash_held, dto.total_remitted);
    const reconciliation = await this.getMutableReconciliation(id, currentUser);
    if (dto.cod_cash_held !== undefined) reconciliation.cod_cash_held = String(dto.cod_cash_held);
    if (dto.cc_cash_held !== undefined) reconciliation.cc_cash_held = String(dto.cc_cash_held);
    if (dto.total_remitted !== undefined) reconciliation.total_remitted = String(dto.total_remitted);
    reconciliation.remittance_status = this.resolveRemittanceStatus(Number(reconciliation.cod_cash_held), Number(reconciliation.cc_cash_held), Number(reconciliation.total_remitted), reconciliation.remittance_status);
    return this.sanitizeReconciliation(await this.reconciliationsRepository.save(reconciliation), currentUser);
  }

  async updateRemittanceStatus(id: string, dto: UpdateRemittanceStatusDto, currentUser: UserEntity): Promise<Record<string, unknown>> {
    this.assertFinanceRole(currentUser);
    if (!Object.values(RemittanceStatus).includes(dto.remittance_status)) throw new BadRequestException('Invalid remittance status');
    const reconciliation = await this.getScopedReconciliation(id, currentUser);
    if (dto.remittance_status === RemittanceStatus.REMITTED && Number(reconciliation.total_remitted) < Number(reconciliation.cod_cash_held) + Number(reconciliation.cc_cash_held)) {
      throw new BadRequestException('Total remitted is lower than cash held');
    }
    reconciliation.remittance_status = dto.remittance_status;
    return this.sanitizeReconciliation(await this.reconciliationsRepository.save(reconciliation), currentUser);
  }

  async getCodReconciliation(query: CodReconciliationQueryDto, currentUser: UserEntity): Promise<Paginated<Record<string, unknown>>> {
    this.assertFinanceRole(currentUser);
    const normalized = await this.normalizeQuery(query, currentUser);
    const page = normalized.page ?? 1;
    const limit = this.resolveLimit(normalized.limit);
    const qb = this.waybillsRepository.createQueryBuilder('waybill')
      .select('COALESCE(waybill.current_hub_id, waybill.dest_hub_id, waybill.origin_hub_id)', 'hub_id')
      .addSelect('DATE(waybill.created_at)', 'reconciliation_date')
      .addSelect('waybill.current_state', 'remittance_status')
      .addSelect('COALESCE(SUM(waybill.cost_amount), 0)', 'amount')
      .addSelect('COUNT(*)', 'total')
      .where('waybill.payment_type = :paymentType', { paymentType: PaymentType.COD })
      .groupBy('hub_id')
      .addGroupBy('reconciliation_date')
      .addGroupBy('waybill.current_state')
      .orderBy('reconciliation_date', 'DESC');
    this.applyDateRangeToWaybill(qb, normalized);
    this.applyWaybillScope(qb, normalized.hub_id, currentUser);
    const allRows = await qb.clone().getRawMany<RawFinance>();
    const rows = await qb.offset((page - 1) * limit).limit(limit).getRawMany<RawFinance>();
    return this.paginate(rows.map((row) => ({ hub_id: row.hub_id, reconciliation_date: row.reconciliation_date, status: row.remittance_status, cod_amount: Number(row.amount ?? 0), total_waybills: Number(row.total ?? 0) })), allRows.length, page, limit);
  }

  async getHubReconciliation(query: HubReconciliationQueryDto, currentUser: UserEntity): Promise<Paginated<Record<string, unknown>>> {
    this.assertFinanceRole(currentUser);
    const normalized = await this.normalizeQuery(query, currentUser);
    const page = normalized.page ?? 1;
    const limit = this.resolveLimit(normalized.limit);
    const qb = this.buildReconciliationQuery(normalized, currentUser)
      .select('reconciliation.hub_id', 'hub_id')
      .addSelect('reconciliation.reconciliation_date', 'reconciliation_date')
      .addSelect('COALESCE(SUM(reconciliation.cod_cash_held), 0)', 'cod')
      .addSelect('COALESCE(SUM(reconciliation.cc_cash_held), 0)', 'cc')
      .addSelect('COALESCE(SUM(reconciliation.total_remitted), 0)', 'remitted')
      .groupBy('reconciliation.hub_id')
      .addGroupBy('reconciliation.reconciliation_date')
      .orderBy('reconciliation.reconciliation_date', 'DESC');
    const allRows = await qb.clone().getRawMany<RawFinance>();
    const rows = await qb.offset((page - 1) * limit).limit(limit).getRawMany<RawFinance>();
    return this.paginate(rows.map((row) => {
      const cod = Number(row.cod ?? 0);
      const cc = Number(row.cc ?? 0);
      const remitted = Number(row.remitted ?? 0);
      return { hub_id: row.hub_id, reconciliation_date: row.reconciliation_date, cod_cash_held: cod, cc_cash_held: cc, total_remitted: remitted, remaining_amount: cod + cc - remitted };
    }), allRows.length, page, limit);
  }

  async approveInternalTripCost(tripId: string, dto: ApproveInternalCostDto, currentUser: UserEntity): Promise<Record<string, unknown>> {
    this.assertFinanceRole(currentUser);
    this.assertNonNegative(dto.fuel_actual, dto.fuel_cost, dto.other_costs);
    const trip = await this.getScopedTrip(tripId, currentUser);
    if (!trip.truck_id) throw new BadRequestException('Internal trip must have a truck assignment');
    if (trip.fuel_cost !== null || trip.other_costs !== null) throw new ConflictException('Trip cost has already been approved');
    if (dto.fuel_actual !== undefined) trip.fuel_actual = dto.fuel_actual;
    if (dto.fuel_cost !== undefined) trip.fuel_cost = String(dto.fuel_cost);
    if (dto.other_costs !== undefined) trip.other_costs = String(dto.other_costs);
    return this.sanitizeTripCost(await this.tripsRepository.save(trip), currentUser);
  }

  async approveVendorTripCost(tripId: string, dto: ApproveVendorCostDto, currentUser: UserEntity): Promise<Record<string, unknown>> {
    this.assertFinanceRole(currentUser);
    this.assertNonNegative(dto.fuel_cost, dto.other_costs);
    const trip = await this.getScopedTrip(tripId, currentUser);
    if (trip.fuel_cost !== null || trip.other_costs !== null) throw new ConflictException('Trip cost has already been approved');
    if (dto.fuel_cost !== undefined) trip.fuel_cost = String(dto.fuel_cost);
    if (dto.other_costs !== undefined) trip.other_costs = String(dto.other_costs);
    return this.sanitizeTripCost(await this.tripsRepository.save(trip), currentUser);
  }

  async getPendingInternalCosts(query: QueryReconciliationsDto, currentUser: UserEntity): Promise<Paginated<Record<string, unknown>>> {
    this.assertFinanceRole(currentUser);
    return this.getPendingCosts(query, currentUser, true);
  }

  async getPendingVendorCosts(query: QueryReconciliationsDto, currentUser: UserEntity): Promise<Paginated<Record<string, unknown>>> {
    this.assertFinanceRole(currentUser);
    return this.getPendingCosts(query, currentUser, false);
  }

  buildFinanceScope(currentUser: UserEntity): Scope {
    return { hubId: getDefaultHubId(currentUser), canViewSystem: isManager(currentUser.role_mask), canViewProfit: isManager(currentUser.role_mask) };
  }

  async listCashFundTransfers(fundId: string | undefined, currentUser: UserEntity): Promise<Record<string, unknown>[]> {
    this.assertFinanceRole(currentUser);
    const params: unknown[] = [];
    let whereSql = '';
    if (fundId?.trim()) {
      params.push(fundId.trim());
      whereSql = `WHERE (t.from_fund_id = $1::bigint OR t.to_fund_id = $1::bigint)`;
    }
    const rows = await this.cashFundsRepository.query(`
      SELECT
        t.id::text AS id,
        t.from_fund_id::text AS from_fund_id,
        ff.code AS from_fund_code,
        ff.name AS from_fund_name,
        t.to_fund_id::text AS to_fund_id,
        tf.code AS to_fund_code,
        tf.name AS to_fund_name,
        t.transfer_date,
        t.amount,
        t.note,
        t.created_by::text AS created_by,
        t.created_by_name,
        t.created_at
      FROM cash_fund_transfers t
      LEFT JOIN cash_funds ff ON ff.id = t.from_fund_id
      LEFT JOIN cash_funds tf ON tf.id = t.to_fund_id
      ${whereSql}
      ORDER BY t.transfer_date DESC, t.id DESC
      LIMIT 200
    `, params) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      ...row,
      amount: Number(row.amount ?? 0),
    }));
  }

  async createCashFundTransfer(dto: { from_fund_id: string; to_fund_id: string; transfer_date?: string; amount: number; note?: string }, currentUser: UserEntity): Promise<Record<string, unknown>> {
    this.assertFinanceRole(currentUser);
    const fromFundId = String(dto.from_fund_id || '').trim();
    const toFundId = String(dto.to_fund_id || '').trim();
    const amount = Math.round(Number(dto.amount || 0));
    if (!fromFundId || !toFundId) throw new BadRequestException('Vui lòng chọn sổ quỹ chuyển và sổ quỹ nhận');
    if (fromFundId === toFundId) throw new BadRequestException('Sổ quỹ chuyển đi và sổ quỹ nhận phải khác nhau');
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Số tiền chuyển quỹ phải lớn hơn 0');

    const [fromFund, toFund] = await Promise.all([
      this.cashFundsRepository.findOne({ where: { id: fromFundId, is_active: true } }),
      this.cashFundsRepository.findOne({ where: { id: toFundId, is_active: true } }),
    ]);
    if (!fromFund) throw new NotFoundException('Sổ quỹ chuyển đi không tồn tại hoặc đã ngừng sử dụng');
    if (!toFund) throw new NotFoundException('Sổ quỹ nhận không tồn tại hoặc đã ngừng sử dụng');

    const transferDate = dto.transfer_date?.trim() || new Date().toISOString().slice(0, 10);
    const createdByName = (currentUser as any).full_name?.trim() || (currentUser as any).name?.trim() || currentUser.username || 'Kế toán';
    const inserted = await this.cashFundsRepository.query(`
      INSERT INTO cash_fund_transfers (from_fund_id, to_fund_id, transfer_date, amount, note, created_by, created_by_name)
      VALUES ($1::bigint, $2::bigint, $3::date, $4::numeric, $5, $6::bigint, $7)
      RETURNING id::text AS id, from_fund_id::text AS from_fund_id, to_fund_id::text AS to_fund_id, transfer_date, amount, note, created_by_name, created_at
    `, [fromFund.id, toFund.id, transferDate, String(amount), dto.note?.trim() || null, currentUser.id, createdByName]) as Array<Record<string, unknown>>;

    return {
      ...inserted[0],
      from_fund_code: fromFund.code,
      from_fund_name: fromFund.name,
      to_fund_code: toFund.code,
      to_fund_name: toFund.name,
      amount,
    };
  }

  async removeCashFundTransfer(id: string, currentUser: UserEntity): Promise<{ success: boolean }> {
    this.assertFinanceRole(currentUser);
    const deleted = await this.cashFundsRepository.query(
      `DELETE FROM cash_fund_transfers WHERE id = $1::bigint RETURNING id`,
      [id],
    ) as Array<{ id: string }>;
    if (!deleted.length) throw new NotFoundException('Không tìm thấy giao dịch chuyển quỹ');
    return { success: true };
  }

  async listPaymentRequests(query: { q?: string; status?: string; hub_id?: string; date_from?: string; date_to?: string }, currentUser: UserEntity): Promise<Record<string, unknown>[]> {
    const params: unknown[] = [];
    const where: string[] = [];
    const addParam = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (query.q?.trim()) {
      const kw = addParam(`%${query.q.trim()}%`);
      where.push(`(pr.request_code ILIKE ${kw} OR pr.beneficiary_name ILIKE ${kw} OR pr.content ILIKE ${kw} OR pr.requester_name ILIKE ${kw} OR pr.department_name ILIKE ${kw} OR COALESCE(pr.cost_category, '') ILIKE ${kw})`);
    }
    if (query.status?.trim()) {
      where.push(`pr.status = ${addParam(query.status.trim())}`);
    }
    if (query.hub_id?.trim()) {
      where.push(`pr.hub_id = ${addParam(query.hub_id.trim())}::bigint`);
    }
    if (query.date_from?.trim()) {
      where.push(`pr.request_date >= ${addParam(query.date_from.trim())}::date`);
    }
    if (query.date_to?.trim()) {
      where.push(`pr.request_date <= ${addParam(query.date_to.trim())}::date`);
    }

    const isFinanceOrMgr = [Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR].some((role) => hasRole(currentUser.role_mask, role));
    if (!isFinanceOrMgr) {
      const assignedHubIds = getAssignedHubIds(currentUser);
      if (assignedHubIds.length) {
        where.push(`(pr.requester_id = ${addParam(currentUser.id)}::bigint OR pr.hub_id = ANY(${addParam(assignedHubIds)}::bigint[]))`);
      } else {
        where.push(`pr.requester_id = ${addParam(currentUser.id)}::bigint`);
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await this.cashFundsRepository.query(`
      SELECT
        pr.id::text AS id,
        pr.request_code,
        pr.request_date,
        pr.department_name,
        pr.hub_id::text AS hub_id,
        h.code AS hub_code,
        h.name AS hub_name,
        pr.requester_id::text AS requester_id,
        pr.requester_name,
        pr.beneficiary_name,
        pr.vendor_id::text AS vendor_id,
        v.code AS vendor_code,
        v.name AS vendor_name,
        pr.amount,
        pr.content,
        pr.note,
        pr.attachment_urls,
        pr.status,
        pr.fund_id::text AS fund_id,
        f.code AS fund_code,
        f.name AS fund_name,
        pr.cost_category,
        pr.source,
        pr.accountant_approved_by::text AS accountant_approved_by,
        pr.accountant_approved_name,
        pr.accountant_approved_at,
        pr.director_approved_by::text AS director_approved_by,
        pr.director_approved_name,
        pr.director_approved_at,
        pr.rejected_by_name,
        pr.rejected_reason,
        pr.cash_journal_entry_id::text AS cash_journal_entry_id,
        pr.created_at,
        pr.updated_at
      FROM payment_requests pr
      LEFT JOIN hubs h ON h.id = pr.hub_id
      LEFT JOIN vendors v ON v.id = pr.vendor_id
      LEFT JOIN cash_funds f ON f.id = pr.fund_id
      ${whereSql}
      ORDER BY pr.request_date DESC, pr.id DESC
      LIMIT 300
    `, params) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      ...row,
      amount: Number(row.amount ?? 0),
    }));
  }

  async createPaymentRequest(dto: any, currentUser: UserEntity): Promise<Record<string, unknown>> {
    const amount = Math.round(Number(dto.amount || 0));
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Số tiền đề nghị phải lớn hơn 0');
    if (!dto.beneficiary_name?.trim() || !dto.content?.trim()) {
      throw new BadRequestException('Vui lòng nhập đối tượng nhận và nội dung đề nghị thanh toán');
    }
    const requestDate = dto.request_date?.trim() || new Date().toISOString().slice(0, 10);
    const ym = requestDate.slice(0, 7).replace('-', '');
    const countRows = await this.cashFundsRepository.query(
      `SELECT COUNT(*)::int AS cnt FROM payment_requests WHERE request_code LIKE $1`,
      [`DNTT-${ym}-%`],
    ) as Array<{ cnt: number }>;
    const seq = Number(countRows[0]?.cnt ?? 0) + 1;
    const requestCode = `DNTT-${ym}-${String(seq).padStart(4, '0')}`;
    const requesterName = (currentUser as any).full_name?.trim() || (currentUser as any).name?.trim() || currentUser.username || 'Nhân sự';
    const defaultHubId = dto.hub_id?.trim() || getDefaultHubId(currentUser) || null;
    const attachments = Array.isArray(dto.attachment_urls) ? JSON.stringify(dto.attachment_urls) : '[]';

    const inserted = await this.cashFundsRepository.query(`
      INSERT INTO payment_requests (
        request_code, request_date, department_name, hub_id, requester_id, requester_name,
        beneficiary_name, vendor_id, amount, content, note, attachment_urls,
        status, fund_id, cost_category, source
      ) VALUES (
        $1, $2::date, $3, $4::bigint, $5::bigint, $6,
        $7, $8::bigint, $9::numeric, $10, $11, $12::jsonb,
        'PENDING_ACCOUNTANT', $13::bigint, $14, $15
      )
      RETURNING id::text AS id, request_code, request_date, status, amount
    `, [
      requestCode,
      requestDate,
      dto.department_name?.trim() || null,
      defaultHubId,
      currentUser.id,
      requesterName,
      dto.beneficiary_name.trim(),
      dto.vendor_id?.trim() || null,
      String(amount),
      dto.content.trim(),
      dto.note?.trim() || null,
      attachments,
      dto.fund_id?.trim() || null,
      dto.cost_category?.trim() || null,
      dto.source?.trim() || 'Nội bộ',
    ]) as Array<Record<string, unknown>>;

    return {
      ...inserted[0],
      amount,
    };
  }

  async approvePaymentRequest(id: string, dto: any, currentUser: UserEntity): Promise<Record<string, unknown>> {
    this.assertFinanceRole(currentUser);
    const existingRows = await this.cashFundsRepository.query(
      `SELECT * FROM payment_requests WHERE id = $1::bigint`,
      [id],
    ) as Array<Record<string, any>>;
    const request = existingRows[0];
    if (!request) throw new NotFoundException('Không tìm thấy đề nghị thanh toán');
    if (request.status === 'APPROVED') throw new ConflictException('Đề nghị thanh toán này đã được duyệt và hạch toán');
    if (request.status === 'REJECTED') throw new BadRequestException('Đề nghị thanh toán đã bị từ chối');

    const fundId = String(dto.fund_id || request.fund_id || '').trim();
    const costCategory = String(dto.cost_category || request.cost_category || '').trim();
    if (!fundId) throw new BadRequestException('Vui lòng chọn sổ quỹ chi tiền');
    if (!costCategory) throw new BadRequestException('Vui lòng chọn mục hạch toán (loại chi phí)');

    const fund = await this.cashFundsRepository.findOne({ where: { id: fundId, is_active: true } });
    if (!fund) throw new NotFoundException('Sổ quỹ không tồn tại hoặc đã ngừng sử dụng');

    const resolvedHubId = String(dto.hub_id || request.hub_id || fund.hub_id || getDefaultHubId(currentUser) || '').trim() || null;
    if (!resolvedHubId) {
      throw new BadRequestException('Vui lòng chọn bưu cục (HUB) nhận khoản chi');
    }
    const resolvedVendorId = String(dto.vendor_id ?? request.vendor_id ?? '').trim() || null;
    const resolvedSource = String(dto.source || request.source || 'Nội bộ').trim();
    const resolvedBeneficiary = String(dto.beneficiary_name || request.beneficiary_name || '').trim();
    const resolvedNote = dto.note !== undefined ? (dto.note?.trim() || null) : request.note;
    const approverName = (currentUser as any).full_name?.trim() || (currentUser as any).name?.trim() || currentUser.username || 'Người duyệt';
    const userIsDirector = (Number(currentUser.role_mask || 0) & (Roles.DIRECTOR | Roles.MANAGER)) !== 0;
    const shouldFinalize = dto.post_to_journal === true || (dto.post_to_journal !== false && (userIsDirector || request.status === 'PENDING_DIRECTOR'));

    if (!shouldFinalize) {
      const updated = await this.cashFundsRepository.query(`
        UPDATE payment_requests
        SET
          status = 'PENDING_DIRECTOR',
          fund_id = $2::bigint,
          cost_category = $3,
          hub_id = $4::bigint,
          vendor_id = $5::bigint,
          source = $6,
          beneficiary_name = $7,
          note = $8,
          accountant_approved_by = $9::bigint,
          accountant_approved_name = $10,
          accountant_approved_at = now(),
          updated_at = now()
        WHERE id = $1::bigint
        RETURNING id::text AS id, request_code, status
      `, [
        id,
        fund.id,
        costCategory,
        resolvedHubId,
        resolvedVendorId,
        resolvedSource,
        resolvedBeneficiary,
        resolvedNote,
        currentUser.id,
        approverName,
      ]) as Array<Record<string, unknown>>;
      return updated[0];
    }

    const entryDate = new Date().toISOString().slice(0, 10);
    const journalContent = `[${request.request_code}] ${request.content}`;
    const attachmentsJson = typeof request.attachment_urls === 'string'
      ? request.attachment_urls
      : JSON.stringify(request.attachment_urls || []);

    const journalRows = await this.cashFundsRepository.query(`
      INSERT INTO cash_journal_entries (
        entry_date, voucher_type, source, fund_id, vendor_id, hub_id,
        cost_category, detail, note, content, income_amount, expense_amount,
        attachment_urls, created_by_id, created_by_name
      ) VALUES (
        $1::date, 'Chi', $2, $3::bigint, $4::bigint, $5::bigint,
        $6, $7, $8, $9, 0, $10::numeric,
        $11::jsonb, $12::bigint, $13
      )
      RETURNING id::text AS id
    `, [
      entryDate,
      resolvedSource,
      fund.id,
      resolvedVendorId,
      resolvedHubId,
      costCategory,
      resolvedBeneficiary,
      resolvedNote,
      journalContent,
      String(request.amount),
      attachmentsJson,
      currentUser.id,
      approverName,
    ]) as Array<{ id: string }>;

    const journalId = journalRows[0]?.id;
    const updated = await this.cashFundsRepository.query(`
      UPDATE payment_requests
      SET
        status = 'APPROVED',
        fund_id = $2::bigint,
        cost_category = $3,
        hub_id = $4::bigint,
        vendor_id = $5::bigint,
        source = $6,
        beneficiary_name = $7,
        note = $8,
        accountant_approved_by = COALESCE(accountant_approved_by, $9::bigint),
        accountant_approved_name = COALESCE(accountant_approved_name, $10),
        accountant_approved_at = COALESCE(accountant_approved_at, now()),
        director_approved_by = $9::bigint,
        director_approved_name = $10,
        director_approved_at = now(),
        cash_journal_entry_id = $11::bigint,
        updated_at = now()
      WHERE id = $1::bigint
      RETURNING id::text AS id, request_code, status, cash_journal_entry_id::text AS cash_journal_entry_id
    `, [
      id,
      fund.id,
      costCategory,
      resolvedHubId,
      resolvedVendorId,
      resolvedSource,
      resolvedBeneficiary,
      resolvedNote,
      currentUser.id,
      approverName,
      journalId,
    ]) as Array<Record<string, unknown>>;

    return updated[0];
  }

  async rejectPaymentRequest(id: string, dto: { reason?: string }, currentUser: UserEntity): Promise<Record<string, unknown>> {
    this.assertFinanceRole(currentUser);
    const existingRows = await this.cashFundsRepository.query(
      `SELECT id, status FROM payment_requests WHERE id = $1::bigint`,
      [id],
    ) as Array<{ id: string; status: string }>;
    if (!existingRows.length) throw new NotFoundException('Không tìm thấy đề nghị thanh toán');
    if (existingRows[0].status === 'APPROVED') throw new ConflictException('Không thể từ chối đề nghị đã duyệt chi');
    const rejectedBy = (currentUser as any).full_name?.trim() || (currentUser as any).name?.trim() || currentUser.username || 'Người duyệt';
    const updated = await this.cashFundsRepository.query(`
      UPDATE payment_requests
      SET status = 'REJECTED', rejected_by_name = $2, rejected_reason = $3, updated_at = now()
      WHERE id = $1::bigint
      RETURNING id::text AS id, request_code, status, rejected_by_name, rejected_reason
    `, [id, rejectedBy, dto.reason?.trim() || 'Không đạt yêu cầu']) as Array<Record<string, unknown>>;
    return updated[0];
  }

  async removePaymentRequest(id: string, currentUser: UserEntity): Promise<{ success: boolean }> {
    const existingRows = await this.cashFundsRepository.query(
      `SELECT id, status, requester_id FROM payment_requests WHERE id = $1::bigint`,
      [id],
    ) as Array<{ id: string; status: string; requester_id: string }>;
    if (!existingRows.length) throw new NotFoundException('Không tìm thấy đề nghị thanh toán');
    if (existingRows[0].status === 'APPROVED') throw new ConflictException('Không thể xóa đề nghị đã duyệt vào sổ nhật ký');
    const isFinanceOrMgr = [Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR].some((role) => hasRole(currentUser.role_mask, role));
    if (!isFinanceOrMgr && String(existingRows[0].requester_id) !== String(currentUser.id)) {
      throw new ForbiddenException('Không có quyền xóa đề nghị của người khác');
    }
    await this.cashFundsRepository.query(`DELETE FROM payment_requests WHERE id = $1::bigint`, [id]);
    return { success: true };
  }

  private sanitizeCashFund(fund: CashFundEntity): Record<string, unknown> {
    return {
      id: fund.id,
      code: fund.code,
      name: fund.name,
      hub_id: fund.hub_id,
      is_active: fund.is_active,
      opening_balance: Number((fund as any).opening_balance ?? 0),
      note: fund.note,
      hub: fund.hub ? { id: fund.hub.id, code: fund.hub.code, name: fund.hub.name } : null,
      created_at: fund.created_at,
      updated_at: fund.updated_at,
    };
  }

  private async getPendingCosts(query: QueryReconciliationsDto, currentUser: UserEntity, internal: boolean): Promise<Paginated<Record<string, unknown>>> {
    const normalized = await this.normalizeQuery(query, currentUser, false);
    const page = normalized.page ?? 1;
    const limit = this.resolveLimit(normalized.limit);
    const qb = this.tripsRepository.createQueryBuilder('trip')
      .leftJoinAndSelect('trip.truck', 'truck')
      .leftJoinAndSelect('trip.start_hub', 'start_hub')
      .leftJoinAndSelect('trip.end_hub', 'end_hub')
      .where('trip.fuel_cost IS NULL')
      .andWhere('trip.other_costs IS NULL')
      .orderBy('trip.departure_time', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (internal) qb.andWhere('trip.truck_id IS NOT NULL');
    else qb.andWhere('trip.truck_id IS NULL');
    this.applyTripScope(qb, normalized.hub_id, currentUser);
    const [items, total] = await qb.getManyAndCount();
    return this.paginate(items.map((item) => this.sanitizeTripCost(item, currentUser)), total, page, limit);
  }

  private buildReconciliationQuery(query: QueryReconciliationsDto, currentUser: UserEntity): SelectQueryBuilder<FinanceReconciliationEntity> {
    const qb = this.reconciliationsRepository.createQueryBuilder('reconciliation');
    if (query.hub_id) qb.andWhere('reconciliation.hub_id = :hubId', { hubId: query.hub_id });
    if (query.reconciliation_date) qb.andWhere('reconciliation.reconciliation_date = :reconciliationDate', { reconciliationDate: query.reconciliation_date });
    if (query.remittance_status) qb.andWhere('reconciliation.remittance_status = :status', { status: query.remittance_status });
    if (query.date_from) qb.andWhere('reconciliation.reconciliation_date >= :dateFrom', { dateFrom: query.date_from });
    if (query.date_to) qb.andWhere('reconciliation.reconciliation_date <= :dateTo', { dateTo: query.date_to });
    this.applyReconciliationScope(qb, currentUser);
    return qb;
  }

  private async getScopedReconciliation(id: string, currentUser: UserEntity): Promise<FinanceReconciliationEntity> {
    const qb = this.reconciliationsRepository.createQueryBuilder('reconciliation').where('reconciliation.id = :id', { id });
    this.applyReconciliationScope(qb, currentUser);
    const reconciliation = await qb.getOne();
    if (!reconciliation) throw new NotFoundException('Reconciliation not found');
    return reconciliation;
  }

  private async getMutableReconciliation(id: string, currentUser: UserEntity): Promise<FinanceReconciliationEntity> {
    const reconciliation = await this.getScopedReconciliation(id, currentUser);
    if (![RemittanceStatus.PENDING, RemittanceStatus.OVERDUE].includes(reconciliation.remittance_status)) throw new BadRequestException('Only PENDING or OVERDUE reconciliations can be updated');
    return reconciliation;
  }

  private async getScopedTrip(tripId: string, currentUser: UserEntity): Promise<TripEntity> {
    const qb = this.tripsRepository.createQueryBuilder('trip').leftJoinAndSelect('trip.truck', 'truck').where('trip.id = :tripId', { tripId });
    this.applyTripScope(qb, undefined, currentUser);
    const trip = await qb.getOne();
    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
  }

  private async normalizeQuery<T extends QueryReconciliationsDto>(query: T, currentUser: UserEntity, validateDates = true): Promise<T> {
    const limit = this.resolveLimit(query.limit);
    if (query.hub_id) {
      await this.assertHubExists(query.hub_id, false);
      this.assertHubAccess(query.hub_id, currentUser);
    }
    if (validateDates) this.validateDateRange(query.date_from, query.date_to);
    return { ...query, limit };
  }

  private validateDateRange(from?: string, to?: string): void {
    if (from && Number.isNaN(new Date(from).getTime())) throw new BadRequestException('Invalid date_from');
    if (to && Number.isNaN(new Date(to).getTime())) throw new BadRequestException('Invalid date_to');
    if (from && to && new Date(from).getTime() > new Date(to).getTime()) throw new BadRequestException('date_from must be before or equal to date_to');
  }

  private validateReconciliationDate(date: string): void {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Invalid reconciliation date');
    const maxFuture = Date.now() + 7 * 24 * 60 * 60 * 1000;
    if (parsed.getTime() > maxFuture) throw new BadRequestException('Reconciliation date is too far in the future');
  }

  private async assertHubExists(hubId: string, requireActive: boolean): Promise<void> {
    const hub = await this.hubsRepository.findOne({ where: requireActive ? { id: hubId, is_active: true } : { id: hubId } });
    if (!hub) throw new NotFoundException('Hub not found');
  }

  private assertFinanceRole(currentUser: UserEntity): void {
    if ([Roles.ACCOUNTANT, Roles.MANAGER, Roles.DIRECTOR].some((role) => hasRole(currentUser.role_mask, role))) return;
    throw new ForbiddenException('Insufficient role permissions for finance');
  }

  private assertHubAccess(hubId: string, currentUser: UserEntity): void {
    if (isManager(currentUser.role_mask)) return;
    if (!getAssignedHubIds(currentUser).includes(String(hubId))) throw new ForbiddenException('User cannot access finance data outside assigned hub');
  }

  private applyReconciliationScope(qb: SelectQueryBuilder<FinanceReconciliationEntity>, currentUser: UserEntity): void {
    if (isManager(currentUser.role_mask)) return;
    const assignedHubIds = getAssignedHubIds(currentUser);
    if (!assignedHubIds.length) throw new ForbiddenException('User is not assigned to a hub');
    if (assignedHubIds.length === 1) {
      qb.andWhere('reconciliation.hub_id = :userHubId', { userHubId: assignedHubIds[0] });
    } else {
      qb.andWhere('reconciliation.hub_id IN (:...userHubIds)', { userHubIds: assignedHubIds });
    }
  }

  private applyTripScope(qb: SelectQueryBuilder<TripEntity>, hubId: string | undefined, currentUser: UserEntity): void {
    if (isManager(currentUser.role_mask) && !hubId) return;
    const scopedHubIds = hubId ? [String(hubId)] : getAssignedHubIds(currentUser);
    if (!scopedHubIds.length) throw new ForbiddenException('User is not assigned to a hub');
    qb.andWhere(new Brackets((inner) => inner
      .where('trip.start_hub_id IN (:...hubIds)', { hubIds: scopedHubIds })
      .orWhere('trip.end_hub_id IN (:...hubIds)', { hubIds: scopedHubIds })));
  }

  private applyWaybillScope(qb: SelectQueryBuilder<WaybillEntity>, hubId: string | undefined, currentUser: UserEntity): void {
    if (isManager(currentUser.role_mask) && !hubId) return;
    const scopedHubIds = hubId ? [String(hubId)] : getAssignedHubIds(currentUser);
    if (!scopedHubIds.length) throw new ForbiddenException('User is not assigned to a hub');
    qb.andWhere(new Brackets((inner) => inner
      .where('waybill.origin_hub_id IN (:...hubIds)', { hubIds: scopedHubIds })
      .orWhere('waybill.dest_hub_id IN (:...hubIds)', { hubIds: scopedHubIds })
      .orWhere('waybill.current_hub_id IN (:...hubIds)', { hubIds: scopedHubIds })));
  }

  private applyDateRangeToWaybill(qb: SelectQueryBuilder<WaybillEntity>, query: QueryReconciliationsDto): void {
    if (query.date_from) qb.andWhere('waybill.created_at >= :dateFrom', { dateFrom: query.date_from });
    if (query.date_to) qb.andWhere('waybill.created_at <= :dateTo', { dateTo: query.date_to });
  }

  private resolveRemittanceStatus(cod: number, cc: number, remitted: number, fallback = RemittanceStatus.PENDING): RemittanceStatus {
    if (remitted >= cod + cc) return RemittanceStatus.REMITTED;
    return fallback === RemittanceStatus.OVERDUE ? RemittanceStatus.OVERDUE : RemittanceStatus.PENDING;
  }

  private assertNonNegative(...values: Array<number | undefined>): void {
    if (values.some((value) => value !== undefined && value < 0)) throw new BadRequestException('Amounts and costs must not be negative');
  }

  private resolveLimit(limit = 20): number {
    return Math.min(limit, 100);
  }

  private sanitizeReconciliation(reconciliation: FinanceReconciliationEntity, currentUser: UserEntity): Record<string, unknown> {
    return {
      id: reconciliation.id,
      hub_id: reconciliation.hub_id,
      reconciliation_date: reconciliation.reconciliation_date,
      cod_cash_held: Number(reconciliation.cod_cash_held),
      cc_cash_held: Number(reconciliation.cc_cash_held),
      total_remitted: Number(reconciliation.total_remitted),
      remaining_amount: Number(reconciliation.cod_cash_held) + Number(reconciliation.cc_cash_held) - Number(reconciliation.total_remitted),
      remittance_status: reconciliation.remittance_status,
      remitted_at: reconciliation.remitted_at,
      hub: reconciliation.hub ? { id: reconciliation.hub.id, code: reconciliation.hub.code, name: reconciliation.hub.name } : undefined,
      can_view_profit: isManager(currentUser.role_mask),
    };
  }

  private sanitizeTripCost(trip: TripEntity, currentUser: UserEntity): Record<string, unknown> {
    const result: Record<string, unknown> = {
      id: trip.id,
      truck_id: trip.truck_id,
      manifest_id: trip.manifest_id,
      start_hub_id: trip.start_hub_id,
      end_hub_id: trip.end_hub_id,
      fuel_actual: trip.fuel_actual,
      fuel_cost: trip.fuel_cost == null ? null : Number(trip.fuel_cost),
      other_costs: trip.other_costs == null ? null : Number(trip.other_costs),
      status: trip.status,
      departure_time: trip.departure_time,
    };
    if (isManager(currentUser.role_mask)) result.profit_visible = true;
    return result;
  }

  private paginate<T>(items: T[], total: number, page: number, limit: number): Paginated<T> {
    return { items, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }
}




