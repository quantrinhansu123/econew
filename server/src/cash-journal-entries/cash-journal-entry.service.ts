import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Roles, hasRole, isManager } from '../common/roles';
import { getAssignedHubIds } from '../common/user-hub-scope';
import { CashFundEntity } from '../finance/cash-fund.entity';
import { UserEntity } from '../users/user.entity';
import { VendorEntity } from '../vendors/vendor.entity';
import { CashJournalEntryEntity } from './cash-journal-entry.entity';
import { CreateCashJournalEntryDto } from './dto/create-cash-journal-entry.dto';
import { QueryCashJournalEntryDto } from './dto/query-cash-journal-entry.dto';
import { UpdateCashJournalEntryDto } from './dto/update-cash-journal-entry.dto';

type JournalRow = Record<string, unknown> & {
  income_amount?: string | number;
  expense_amount?: string | number;
};

@Injectable()
export class CashJournalEntryService {
  constructor(
    @InjectRepository(CashJournalEntryEntity) private readonly repository: Repository<CashJournalEntryEntity>,
  ) {}

  async list(query: QueryCashJournalEntryDto, currentUser: UserEntity) {
    this.assertFinanceAccess(currentUser);
    const page = query.page ?? 1;
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const params: unknown[] = [];
    const where: string[] = [];
    const addParam = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (query.q?.trim()) {
      const key = addParam(`%${query.q.trim()}%`);
      where.push(`(entry.detail ILIKE ${key} OR entry.content ILIKE ${key} OR entry.note ILIKE ${key} OR entry.source ILIKE ${key} OR entry.vendor_name ILIKE ${key} OR entry.fund_code ILIKE ${key})`);
    }
    if (query.date_from) where.push(`entry.entry_date >= ${addParam(query.date_from)}::date`);
    if (query.date_to) where.push(`entry.entry_date <= ${addParam(query.date_to)}::date`);
    if (query.voucher_type) where.push(`entry.voucher_type = ${addParam(query.voucher_type)}`);
    if (query.fund_id) where.push(`entry.fund_id = ${addParam(query.fund_id)}::bigint`);
    if (query.vendor_id) where.push(`entry.vendor_id = ${addParam(query.vendor_id)}::bigint`);
    if (query.cost_category?.trim()) where.push(`entry.cost_category = ${addParam(query.cost_category.trim())}`);

    if (!isManager(currentUser.role_mask)) {
      const hubIds = getAssignedHubIds(currentUser);
      if (!hubIds.length) throw new ForbiddenException('Tài khoản chưa được gán bưu cục');
      where.push(`(entry.fund_hub_id IS NULL OR entry.fund_hub_id = ANY(${addParam(hubIds)}::bigint[]))`);
    }

    const baseSql = this.buildUnifiedJournalSql();
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const summaryRows = await this.repository.query(
      `${baseSql} SELECT COUNT(*)::int AS total, COALESCE(SUM(entry.income_amount), 0) AS total_income, COALESCE(SUM(entry.expense_amount), 0) AS total_expense FROM entry ${whereSql}`,
      params,
    ) as Array<{ total: number; total_income: string; total_expense: string }>;
    const rows = await this.repository.query(
      `${baseSql} SELECT * FROM entry ${whereSql} ORDER BY entry.entry_date DESC, entry.created_at DESC, entry.id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      params,
    ) as JournalRow[];
    const summary = summaryRows[0] ?? { total: 0, total_income: '0', total_expense: '0' };
    const totalIncome = Number(summary.total_income ?? 0);
    const totalExpense = Number(summary.total_expense ?? 0);
    return {
      items: rows.map((row) => ({
        ...row,
        income_amount: Number(row.income_amount ?? 0),
        expense_amount: Number(row.expense_amount ?? 0),
      })),
      meta: {
        total: Number(summary.total ?? 0),
        page,
        limit,
        total_pages: Math.ceil(Number(summary.total ?? 0) / limit),
        total_income: totalIncome,
        total_expense: totalExpense,
        balance: totalIncome - totalExpense,
      },
    };
  }

  async findOne(id: string, currentUser: UserEntity) {
    this.assertFinanceAccess(currentUser);
    const entry = await this.repository.findOne({ where: { id }, relations: ['fund', 'vendor', 'creator'] });
    if (!entry) throw new NotFoundException('Không tìm thấy giao dịch thu chi');
    this.assertFundScope(entry.fund, currentUser);
    return entry;
  }

  async create(dto: CreateCashJournalEntryDto, currentUser: UserEntity) {
    this.assertFinanceAccess(currentUser);
    this.assertAmounts(dto);
    const { fund, vendor } = await this.resolveReferences(dto.fund_id, dto.vendor_id, currentUser);
    const entry = this.repository.create({
      ...dto,
      fund_id: String(fund.id),
      vendor_id: vendor ? String(vendor.id) : null,
      note: dto.note?.trim() || null,
      created_by_id: currentUser.id,
      created_by_name: currentUser.full_name?.trim() || currentUser.username,
      income_amount: String(dto.income_amount),
      expense_amount: String(dto.expense_amount),
    });
    return this.repository.save(entry);
  }

  async update(id: string, dto: UpdateCashJournalEntryDto, currentUser: UserEntity) {
    const entry = await this.findOne(id, currentUser);
    const next = { ...entry, ...dto } as CashJournalEntryEntity;
    this.assertAmounts({
      voucher_type: next.voucher_type,
      income_amount: Number(next.income_amount),
      expense_amount: Number(next.expense_amount),
    });
    if (dto.fund_id !== undefined || dto.vendor_id !== undefined) {
      const { fund, vendor } = await this.resolveReferences(
        dto.fund_id ?? String(entry.fund_id),
        dto.vendor_id === undefined ? entry.vendor_id ?? undefined : dto.vendor_id,
        currentUser,
      );
      next.fund_id = String(fund.id);
      next.vendor_id = vendor ? String(vendor.id) : null;
    }
    if (dto.note !== undefined) next.note = dto.note.trim() || null;
    next.income_amount = String(next.income_amount);
    next.expense_amount = String(next.expense_amount);
    return this.repository.save(next);
  }

  async remove(id: string, currentUser: UserEntity): Promise<void> {
    const entry = await this.findOne(id, currentUser);
    await this.repository.remove(entry);
  }

  private assertAmounts(dto: Pick<CreateCashJournalEntryDto, 'voucher_type' | 'income_amount' | 'expense_amount'>) {
    const income = Number(dto.income_amount ?? 0);
    const expense = Number(dto.expense_amount ?? 0);
    if (income < 0 || expense < 0 || (income > 0) === (expense > 0)) {
      throw new BadRequestException('Mỗi giao dịch chỉ được nhập một khoản Thu hoặc Chi lớn hơn 0');
    }
    if ((dto.voucher_type === 'Thu' && income <= 0) || (dto.voucher_type === 'Chi' && expense <= 0)) {
      throw new BadRequestException('Loại phiếu không khớp với số tiền Thu/Chi');
    }
  }

  private async resolveReferences(fundId: string, vendorId: string | undefined, currentUser: UserEntity) {
    const fund = await this.repository.manager.getRepository(CashFundEntity).findOne({ where: { id: fundId, is_active: true }, relations: ['hub'] });
    if (!fund) throw new NotFoundException('Sổ quỹ không tồn tại hoặc đã ngừng sử dụng');
    this.assertFundScope(fund, currentUser);
    const vendor = vendorId
      ? await this.repository.manager.getRepository(VendorEntity).findOne({ where: { id: vendorId } })
      : null;
    if (vendorId && !vendor) throw new NotFoundException('Nhà cung cấp không tồn tại');
    return { fund, vendor };
  }

  private assertFundScope(fund: CashFundEntity | null | undefined, currentUser: UserEntity) {
    if (!fund?.hub_id || isManager(currentUser.role_mask)) return;
    if (!getAssignedHubIds(currentUser).includes(String(fund.hub_id))) {
      throw new ForbiddenException('Không được ghi nhận vào sổ quỹ của bưu cục khác');
    }
  }

  private assertFinanceAccess(currentUser: UserEntity) {
    if (!hasRole(currentUser.role_mask, Roles.ACCOUNTANT) && !isManager(currentUser.role_mask)) {
      throw new ForbiddenException('Không có quyền truy cập nhật ký thu chi');
    }
  }

  private buildUnifiedJournalSql() {
    return `WITH entry AS (
      SELECT
        CONCAT('MANUAL-', journal.id) AS id,
        journal.id::text AS record_id,
        'MANUAL'::varchar AS source_type,
        true AS editable,
        journal.entry_date,
        journal.voucher_type,
        journal.source,
        journal.cost_category,
        journal.detail,
        journal.note,
        journal.content,
        journal.income_amount,
        journal.expense_amount,
        journal.fund_id,
        fund.code AS fund_code,
        fund.name AS fund_name,
        fund.hub_id AS fund_hub_id,
        journal.vendor_id,
        vendor.code AS vendor_code,
        vendor.name AS vendor_name,
        journal.created_by_name,
        journal.created_at
      FROM cash_journal_entries journal
      LEFT JOIN cash_funds fund ON fund.id = journal.fund_id
      LEFT JOIN vendors vendor ON vendor.id = journal.vendor_id

      UNION ALL

      SELECT
        CONCAT('WAYBILL-', voucher.id) AS id,
        voucher.id::text AS record_id,
        voucher.source_type::varchar AS source_type,
        false AS editable,
        voucher.created_at::date AS entry_date,
        voucher.voucher_type,
        'Vận đơn'::varchar AS source,
        CASE
          WHEN voucher.source_type = 'COD_COLLECTION' THEN 'Thu COD/CC'
          WHEN voucher.source_type = 'CUSTOMER_PAYOUT' THEN 'Chi trả khách hàng'
          WHEN LOWER(voucher.voucher_type) = 'thu' THEN 'Thu cước vận đơn'
          ELSE 'Điều chỉnh vận đơn'
        END::varchar AS cost_category,
        voucher.waybill_code::varchar AS detail,
        voucher.note,
        COALESCE(voucher.note, CONCAT('Thanh toán bill ', voucher.waybill_code))::varchar AS content,
        CASE WHEN LOWER(voucher.voucher_type) = 'thu' THEN voucher.amount ELSE 0 END AS income_amount,
        CASE WHEN LOWER(voucher.voucher_type) = 'chi' THEN voucher.amount ELSE 0 END AS expense_amount,
        voucher.fund_id,
        fund.code AS fund_code,
        fund.name AS fund_name,
        fund.hub_id AS fund_hub_id,
        NULL::bigint AS vendor_id,
        NULL::varchar AS vendor_code,
        NULL::varchar AS vendor_name,
        voucher.created_by_name,
        voucher.created_at
      FROM waybill_cash_vouchers voucher
      LEFT JOIN cash_funds fund ON fund.id = voucher.fund_id
      WHERE voucher.fund_id IS NOT NULL

      UNION ALL

      SELECT
        CONCAT('VENDOR-', payment.id) AS id,
        payment.id::text AS record_id,
        'VENDOR_PAYMENT'::varchar AS source_type,
        false AS editable,
        payment.payment_date::date AS entry_date,
        'Chi'::varchar AS voucher_type,
        'Nhà cung cấp'::varchar AS source,
        COALESCE(payment.cost_category, 'Thanh toán NCC')::varchar AS cost_category,
        COALESCE(vendor.code, vendor.name, CONCAT('#', payment.vendor_id))::varchar AS detail,
        payment.description AS note,
        COALESCE(payment.description, CONCAT('Thanh toán NCC ', COALESCE(vendor.code, vendor.name)))::varchar AS content,
        0::numeric AS income_amount,
        payment.amount AS expense_amount,
        payment.fund_id,
        fund.code AS fund_code,
        fund.name AS fund_name,
        fund.hub_id AS fund_hub_id,
        payment.vendor_id,
        vendor.code AS vendor_code,
        vendor.name AS vendor_name,
        COALESCE(creator.full_name, creator.username)::varchar AS created_by_name,
        payment.created_at
      FROM vendor_payments payment
      LEFT JOIN cash_funds fund ON fund.id = payment.fund_id
      LEFT JOIN vendors vendor ON vendor.id = payment.vendor_id
      LEFT JOIN users creator ON creator.id = payment.created_by
      WHERE payment.fund_id IS NOT NULL
    )`;
  }
}
