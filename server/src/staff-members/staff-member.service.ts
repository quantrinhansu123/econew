import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, LessThanOrEqual, Repository } from 'typeorm';
import { CashJournalEntryEntity } from '../cash-journal-entries/cash-journal-entry.entity';
import { getAssignedHubIds } from '../common/user-hub-scope';
import { isDirector, isManager } from '../common/roles';
import { CashFundEntity } from '../finance/cash-fund.entity';
import { HubEntity } from '../hubs/hub.entity';
import { UserEntity } from '../users/user.entity';
import { CreateStaffMemberDto } from './dto/create-staff-member.dto';
import { QueryStaffMemberDto } from './dto/query-staff-member.dto';
import { CreateStaffDepartmentDto, UpdateStaffDepartmentDto } from './dto/staff-department.dto';
import { UpdateStaffMemberDto } from './dto/update-staff-member.dto';
import { UpsertStaffAttendanceDto } from './dto/upsert-staff-attendance.dto';
import { CreateSalaryAdvanceDto } from './dto/create-salary-advance.dto';
import { UpdateSalaryAdvanceDto } from './dto/update-salary-advance.dto';
import { UpsertPayrollAdjustmentDto } from './dto/upsert-payroll-adjustment.dto';
import { CreateSalaryPaymentDto } from './dto/create-salary-payment.dto';
import { SalaryAdvanceChangeLogEntity, SalaryAdvanceFieldChange } from './salary-advance-change-log.entity';
import { SalaryAdvanceEntity } from './salary-advance.entity';
import { StaffPayrollAdjustmentEntity } from './staff-payroll-adjustment.entity';
import { StaffAttendanceEntity } from './staff-attendance.entity';
import { StaffDepartmentEntity } from './staff-department.entity';
import { StaffMemberEntity } from './staff-member.entity';
import { StaffSalaryPaymentEntity } from './staff-salary-payment.entity';

const COMPENSATION_FIELDS = [
  'base_salary',
  'meal_allowance',
  'transport_allowance',
  'other_allowance',
  'overtime_hourly_rate',
  'opening_salary_debt',
] as const;

@Injectable()
export class StaffMemberService {
  constructor(
    @InjectRepository(StaffMemberEntity) private readonly staffRepository: Repository<StaffMemberEntity>,
    @InjectRepository(StaffDepartmentEntity) private readonly departmentRepository: Repository<StaffDepartmentEntity>,
    @InjectRepository(StaffAttendanceEntity) private readonly attendanceRepository: Repository<StaffAttendanceEntity>,
    @InjectRepository(SalaryAdvanceEntity) private readonly salaryAdvanceRepository: Repository<SalaryAdvanceEntity>,
    @InjectRepository(SalaryAdvanceChangeLogEntity) private readonly salaryAdvanceChangeLogRepository: Repository<SalaryAdvanceChangeLogEntity>,
    @InjectRepository(StaffPayrollAdjustmentEntity) private readonly payrollAdjustmentRepository: Repository<StaffPayrollAdjustmentEntity>,
    @InjectRepository(CashFundEntity) private readonly cashFundRepository: Repository<CashFundEntity>,
    @InjectRepository(StaffSalaryPaymentEntity) private readonly salaryPaymentRepository: Repository<StaffSalaryPaymentEntity>,
  ) {}

  async list(query: QueryStaffMemberDto, currentUser?: UserEntity, includeCompensation = false) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 500);
    const qb = this.staffRepository.createQueryBuilder('staff')
      .leftJoinAndSelect('staff.department_record', 'department')
      .leftJoinAndSelect('staff.hub', 'hub')
      .leftJoin('staff.user', 'user')
      .addSelect(['user.id', 'user.username', 'user.full_name'])
      .orderBy('staff.employee_code', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);
    if (query.q?.trim()) {
      const keyword = `%${query.q.trim()}%`;
      qb.andWhere(new Brackets((inner) => inner
        .where('staff.employee_code ILIKE :keyword', { keyword })
        .orWhere('staff.full_name ILIKE :keyword', { keyword })
        .orWhere('staff.phone ILIKE :keyword', { keyword })
        .orWhere('staff.position ILIKE :keyword', { keyword })
        .orWhere('department.name ILIKE :keyword', { keyword })));
    }
    if (query.department_id) qb.andWhere('staff.department_id = :departmentId', { departmentId: query.department_id });
    if (query.employment_status) qb.andWhere('staff.employment_status = :status', { status: query.employment_status });
    const [data, total] = await qb.getManyAndCount();
    const canViewCompensation = includeCompensation || isDirector(currentUser?.role_mask ?? 0);
    return { data: data.map((item) => this.toResponse(item, canViewCompensation)), total, page, limit };
  }

  async findOne(id: string, currentUser?: UserEntity) {
    const entity = await this.staffRepository.findOne({ where: { id }, relations: ['department_record', 'hub', 'user'] });
    if (!entity) throw new NotFoundException('Không tìm thấy nhân sự');
    return this.toResponse(entity, isDirector(currentUser?.role_mask ?? 0));
  }

  async create(dto: CreateStaffMemberDto, currentUser: UserEntity) {
    this.assertCanManageCompensation(dto, currentUser);
    this.assertEmploymentDates(dto.hire_date, dto.termination_date);
    const department = await this.getActiveDepartment(dto.department_id);
    await this.assertUnique(dto.employee_code, dto.phone, dto.user_id);
    await this.assertReferences(dto.hub_id, dto.user_id);
    const entity = this.staffRepository.create({
      ...this.mapDto(dto),
      employee_code: dto.employee_code.trim().toUpperCase(),
      full_name: dto.full_name.trim(),
      department_id: department.id,
      department: department.name,
      position: dto.position.trim(),
      phone: dto.phone.trim(),
      password_hash: null,
    });
    return this.toResponse(await this.staffRepository.save(entity), isDirector(currentUser.role_mask));
  }

  async update(id: string, dto: UpdateStaffMemberDto, currentUser: UserEntity) {
    this.assertCanManageCompensation(dto, currentUser);
    const entity = await this.staffRepository.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Không tìm thấy nhân sự');
    this.assertEmploymentDates(dto.hire_date === undefined ? entity.hire_date : dto.hire_date, dto.termination_date === undefined ? entity.termination_date : dto.termination_date);
    const department = dto.department_id ? await this.getActiveDepartment(dto.department_id) : null;
    await this.assertUnique(dto.employee_code ?? entity.employee_code, dto.phone ?? entity.phone, dto.user_id === undefined ? entity.user_id ?? undefined : dto.user_id, id);
    await this.assertReferences(dto.hub_id, dto.user_id);
    Object.assign(entity, this.mapDto(dto));
    if (dto.employee_code !== undefined) entity.employee_code = dto.employee_code.trim().toUpperCase();
    if (dto.full_name !== undefined) entity.full_name = dto.full_name.trim();
    if (dto.position !== undefined) entity.position = dto.position.trim();
    if (dto.phone !== undefined) entity.phone = dto.phone.trim();
    if (department) {
      entity.department_id = department.id;
      entity.department = department.name;
    }
    return this.toResponse(await this.staffRepository.save(entity), isDirector(currentUser.role_mask));
  }

  async remove(id: string) {
    const entity = await this.staffRepository.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Không tìm thấy nhân sự');
    entity.employment_status = 'INACTIVE';
    await this.staffRepository.save(entity);
  }

  listDepartments(includeInactive = false) {
    return this.departmentRepository.find({
      where: includeInactive ? {} : { is_active: true },
      order: { name: 'ASC' },
    });
  }

  async createDepartment(dto: CreateStaffDepartmentDto) {
    const code = dto.code.trim().toUpperCase();
    const name = dto.name.trim().replace(/\s+/g, ' ');
    await this.assertUniqueDepartment(code, name);
    return this.departmentRepository.save(this.departmentRepository.create({ code, name, is_active: dto.is_active ?? true }));
  }

  async updateDepartment(id: string, dto: UpdateStaffDepartmentDto) {
    const department = await this.departmentRepository.findOne({ where: { id } });
    if (!department) throw new NotFoundException('Không tìm thấy bộ phận');
    const code = dto.code?.trim().toUpperCase() ?? department.code;
    const name = dto.name?.trim().replace(/\s+/g, ' ') ?? department.name;
    await this.assertUniqueDepartment(code, name, id);
    department.code = code;
    department.name = name;
    if (dto.is_active !== undefined) department.is_active = dto.is_active;
    await this.departmentRepository.save(department);
    await this.staffRepository.createQueryBuilder().update().set({ department: name }).where('department_id = :id', { id }).execute();
    return department;
  }

  async removeDepartment(id: string) {
    const department = await this.departmentRepository.findOne({ where: { id } });
    if (!department) throw new NotFoundException('Không tìm thấy bộ phận');
    department.is_active = false;
    return this.departmentRepository.save(department);
  }

  async listAttendance(month: string) {
    const { from, to } = this.monthBounds(month);
    const [staff, monthRecords] = await Promise.all([
      this.listStaffEmployedDuring(from, to),
      this.attendanceRepository.createQueryBuilder('attendance')
        .where('attendance.work_date BETWEEN :from AND :to', { from, to })
        .orderBy('attendance.work_date', 'ASC')
        .getMany(),
    ]);
    return {
      staff: staff.map((item) => this.toResponse(item)),
      records: staff.flatMap((item) => this.attendanceRecordsWithDefaults(item, month, monthRecords)),
    };
  }

  async upsertAttendance(staffId: string, date: string, dto: UpsertStaffAttendanceDto, currentUser: UserEntity) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
      throw new BadRequestException('Ngày chấm công không hợp lệ');
    }
    const staff = await this.staffRepository.findOne({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('Không tìm thấy nhân sự');
    let record = await this.attendanceRepository.findOne({ where: { staff_member_id: staffId, work_date: date } });
    if (!record) record = this.attendanceRepository.create({ staff_member_id: staffId, work_date: date, created_by: currentUser.id });
    record.work_days = String(dto.work_days);
    record.overtime_hours = String(dto.overtime_hours);
    record.note = dto.note?.trim() || null;
    return this.attendanceRepository.save(record);
  }

  async payroll(month: string) {
    const { from, to } = this.monthBounds(month);
    const [staff, attendanceRecords, advances, adjustments, payments] = await Promise.all([
      this.listStaffEmployedDuring(from, to),
      this.attendanceRepository.find({ where: { work_date: LessThanOrEqual(to) }, order: { work_date: 'ASC' } }),
      this.salaryAdvanceRepository.find({ where: { advance_date: LessThanOrEqual(to) }, order: { advance_date: 'ASC' } }),
      this.payrollAdjustmentRepository.createQueryBuilder('adjustment').where('adjustment.payroll_month <= :month', { month }).getMany(),
      this.salaryPaymentRepository.find({ where: { payroll_month: month } }),
    ]);
    return staff.map((item) => this.calculatePayrollRow(this.toResponse(item, true), month, attendanceRecords, advances, adjustments, payments));
  }

  async createSalaryPayment(staffId: string, month: string, dto: CreateSalaryPaymentDto, currentUser: UserEntity) {
    this.monthBounds(month);
    if (await this.salaryPaymentRepository.exist({ where: { staff_member_id: staffId, payroll_month: month } })) {
      throw new ConflictException('Lương tháng này của nhân sự đã được thanh toán');
    }
    const [staff, fund, payrollRows] = await Promise.all([
      this.staffRepository.findOne({ where: { id: staffId }, relations: ['hub'] }),
      this.cashFundRepository.findOne({ where: { id: dto.fund_id, is_active: true }, relations: ['hub'] }),
      this.payroll(month),
    ]);
    if (!staff) throw new NotFoundException('Không tìm thấy nhân sự');
    if (!fund) throw new NotFoundException('Sổ quỹ không tồn tại hoặc đã ngừng sử dụng');
    const payrollRow = payrollRows.find((row) => String(row.id) === String(staffId));
    if (!payrollRow) throw new BadRequestException('Nhân sự không thuộc kỳ lương này');
    const amount = Math.round(Number(payrollRow.net_salary || 0));
    if (amount <= 0) throw new BadRequestException('Số tiền thực lĩnh phải lớn hơn 0');
    const hubId = fund.hub_id || staff.hub_id;
    if (!hubId) throw new BadRequestException('Vui lòng dùng sổ quỹ có bưu cục hoặc gán bưu cục cho nhân sự');
    if (!isManager(currentUser.role_mask) && !getAssignedHubIds(currentUser).includes(String(hubId))) {
      throw new BadRequestException('Không được thanh toán lương tại bưu cục khác');
    }
    const paymentDate = new Date().toISOString().slice(0, 10);
    return this.staffRepository.manager.transaction(async (manager) => {
      const journal = await manager.getRepository(CashJournalEntryEntity).save(manager.getRepository(CashJournalEntryEntity).create({
        entry_date: paymentDate,
        voucher_type: 'Chi',
        source: 'Thanh toán lương',
        fund_id: fund.id,
        vendor_id: null,
        hub_id: String(hubId),
        cost_category: '334-Phải trả người lao động',
        detail: `${staff.employee_code} · ${staff.full_name}`,
        note: `Thanh toán lương tháng ${month}`,
        content: `Thanh toán lương ${month} cho ${staff.full_name}`,
        income_amount: '0',
        expense_amount: String(amount),
        attachment_urls: [],
        created_by_id: currentUser.id,
        created_by_name: this.userDisplayName(currentUser),
      }));
      return manager.getRepository(StaffSalaryPaymentEntity).save(manager.getRepository(StaffSalaryPaymentEntity).create({
        staff_member_id: staff.id,
        payroll_month: month,
        payment_date: paymentDate,
        amount: String(amount),
        fund_id: fund.id,
        hub_id: String(hubId),
        cash_journal_entry_id: journal.id,
        created_by: currentUser.id,
      }));
    });
  }

  async listSalaryAdvances(month?: string) {
    const qb = this.salaryAdvanceRepository.createQueryBuilder('advance')
      .leftJoin('advance.staff_member', 'staff')
      .addSelect([
        'staff.id',
        'staff.employee_code',
        'staff.full_name',
        'staff.department_id',
        'staff.department',
        'staff.position',
        'staff.hub_id',
        'staff.employment_status',
      ])
      .leftJoinAndSelect('advance.fund', 'fund')
      .leftJoinAndSelect('advance.hub', 'hub')
      .leftJoin('advance.creator', 'creator')
      .addSelect(['creator.id', 'creator.username', 'creator.full_name'])
      .orderBy('advance.advance_date', 'DESC').addOrderBy('advance.id', 'DESC');
    if (month) {
      const { from, to } = this.monthBounds(month);
      qb.where('advance.advance_date BETWEEN :from AND :to', { from, to });
    }
    return qb.getMany();
  }

  async createSalaryAdvance(dto: CreateSalaryAdvanceDto, currentUser: UserEntity) {
    const [staff, fund] = await Promise.all([
      this.staffRepository.findOne({ where: { id: dto.staff_member_id }, relations: ['hub'] }),
      this.cashFundRepository.findOne({ where: { id: dto.fund_id, is_active: true }, relations: ['hub'] }),
    ]);
    if (!staff || staff.employment_status !== 'ACTIVE') throw new NotFoundException('Nhân sự không tồn tại hoặc đã nghỉ');
    if (!fund) throw new NotFoundException('Sổ quỹ không tồn tại hoặc đã ngừng sử dụng');
    const hubId = dto.hub_id || fund.hub_id || staff.hub_id;
    if (!hubId) throw new BadRequestException('Vui lòng chọn bưu cục cho khoản tạm ứng');
    if (fund.hub_id && String(fund.hub_id) !== String(hubId)) throw new BadRequestException('Bưu cục không khớp với sổ quỹ');
    if (!isManager(currentUser.role_mask) && !getAssignedHubIds(currentUser).includes(String(hubId))) {
      throw new BadRequestException('Không được chi tạm ứng tại bưu cục khác');
    }
    return this.staffRepository.manager.transaction(async (manager) => {
      const journal = await manager.getRepository(CashJournalEntryEntity).save(manager.getRepository(CashJournalEntryEntity).create({
        entry_date: dto.advance_date,
        voucher_type: 'Chi',
        source: 'Tạm ứng lương',
        fund_id: dto.fund_id,
        vendor_id: null,
        hub_id: String(hubId),
        cost_category: '334-Phải trả người lao động',
        detail: `${staff.employee_code} · ${staff.full_name}`,
        note: dto.note?.trim() || null,
        content: `Tạm ứng lương ${staff.full_name}`,
        income_amount: '0',
        expense_amount: String(dto.amount),
        attachment_urls: [],
        created_by_id: currentUser.id,
        created_by_name: currentUser.full_name?.trim() || currentUser.username,
      }));
      const advance = await manager.getRepository(SalaryAdvanceEntity).save(manager.getRepository(SalaryAdvanceEntity).create({
        staff_member_id: staff.id,
        advance_date: dto.advance_date,
        amount: String(dto.amount),
        fund_id: dto.fund_id,
        hub_id: String(hubId),
        note: dto.note?.trim() || null,
        cash_journal_entry_id: journal.id,
        created_by: currentUser.id,
      }));
      const hub = await manager.getRepository(HubEntity).findOne({ where: { id: String(hubId) } });
      await manager.getRepository(SalaryAdvanceChangeLogEntity).save(manager.getRepository(SalaryAdvanceChangeLogEntity).create({
        salary_advance_id: advance.id,
        action: 'CREATED',
        changes: this.buildSalaryAdvanceChanges(null, this.salaryAdvanceSnapshot(advance, staff, fund, hub)),
        changed_by_id: currentUser.id,
        changed_by_name: this.userDisplayName(currentUser),
      }));
      return advance;
    });
  }

  async getSalaryAdvanceSummary(staffMemberId: string, month: string) {
    if (!staffMemberId?.trim()) throw new BadRequestException('Vui lòng chọn nhân sự');
    const { from, to } = this.monthBounds(month);
    const result = await this.salaryAdvanceRepository.createQueryBuilder('advance')
      .select('COALESCE(SUM(advance.amount), 0)', 'total_amount')
      .addSelect('COUNT(advance.id)', 'advance_count')
      .where('advance.staff_member_id = :staffMemberId', { staffMemberId })
      .andWhere('advance.advance_date BETWEEN :from AND :to', { from, to })
      .getRawOne<{ total_amount: string; advance_count: string }>();
    return {
      staff_member_id: String(staffMemberId),
      month,
      total_amount: Number(result?.total_amount || 0),
      advance_count: Number(result?.advance_count || 0),
    };
  }

  async updateSalaryAdvance(id: string, dto: UpdateSalaryAdvanceDto, currentUser: UserEntity) {
    const advance = await this.salaryAdvanceRepository.findOne({ where: { id } });
    if (!advance) throw new NotFoundException('Không tìm thấy khoản tạm ứng');

    const staffMemberId = dto.staff_member_id ?? advance.staff_member_id;
    const fundId = dto.fund_id ?? advance.fund_id;
    const [oldStaff, oldFund, oldHub, staff, fund] = await Promise.all([
      this.staffRepository.findOne({ where: { id: advance.staff_member_id } }),
      this.cashFundRepository.findOne({ where: { id: advance.fund_id }, relations: ['hub'] }),
      advance.hub_id ? this.staffRepository.manager.getRepository(HubEntity).findOne({ where: { id: advance.hub_id } }) : Promise.resolve(null),
      this.staffRepository.findOne({ where: { id: staffMemberId }, relations: ['hub'] }),
      this.cashFundRepository.findOne({ where: { id: fundId, is_active: true }, relations: ['hub'] }),
    ]);
    if (!oldStaff || !oldFund) throw new NotFoundException('Dữ liệu gốc của khoản tạm ứng không còn tồn tại');
    if (!staff || staff.employment_status !== 'ACTIVE') throw new NotFoundException('Nhân sự không tồn tại hoặc đã nghỉ');
    if (!fund) throw new NotFoundException('Sổ quỹ không tồn tại hoặc đã ngừng sử dụng');

    const hubId = dto.hub_id !== undefined
      ? dto.hub_id
      : dto.fund_id !== undefined || dto.staff_member_id !== undefined
        ? fund.hub_id || staff.hub_id
        : advance.hub_id || fund.hub_id || staff.hub_id;
    if (!hubId) throw new BadRequestException('Vui lòng chọn bưu cục cho khoản tạm ứng');
    if (fund.hub_id && String(fund.hub_id) !== String(hubId)) throw new BadRequestException('Bưu cục không khớp với sổ quỹ');
    if (!isManager(currentUser.role_mask) && !getAssignedHubIds(currentUser).includes(String(hubId))) {
      throw new BadRequestException('Không được chi tạm ứng tại bưu cục khác');
    }

    const hub = await this.staffRepository.manager.getRepository(HubEntity).findOne({ where: { id: String(hubId) } });
    const nextValues = {
      staff_member_id: staff.id,
      advance_date: dto.advance_date ?? advance.advance_date,
      amount: String(dto.amount ?? advance.amount),
      fund_id: fund.id,
      hub_id: String(hubId),
      note: dto.note === undefined ? advance.note : dto.note?.trim() || null,
    };
    const changes = this.buildSalaryAdvanceChanges(
      this.salaryAdvanceSnapshot(advance, oldStaff, oldFund, oldHub),
      this.salaryAdvanceSnapshot({ ...advance, ...nextValues }, staff, fund, hub),
    );
    if (!Object.keys(changes).length) throw new BadRequestException('Không có thay đổi để lưu');

    return this.staffRepository.manager.transaction(async (manager) => {
      const journal = await manager.getRepository(CashJournalEntryEntity).findOne({ where: { id: advance.cash_journal_entry_id } });
      if (!journal) throw new NotFoundException('Không tìm thấy phiếu chi liên kết');
      Object.assign(journal, {
        entry_date: nextValues.advance_date,
        fund_id: nextValues.fund_id,
        hub_id: nextValues.hub_id,
        detail: `${staff.employee_code} · ${staff.full_name}`,
        note: nextValues.note,
        content: `Tạm ứng lương ${staff.full_name}`,
        expense_amount: nextValues.amount,
      });
      await manager.getRepository(CashJournalEntryEntity).save(journal);
      Object.assign(advance, nextValues);
      const saved = await manager.getRepository(SalaryAdvanceEntity).save(advance);
      await manager.getRepository(SalaryAdvanceChangeLogEntity).save(manager.getRepository(SalaryAdvanceChangeLogEntity).create({
        salary_advance_id: advance.id,
        action: 'UPDATED',
        changes,
        changed_by_id: currentUser.id,
        changed_by_name: this.userDisplayName(currentUser),
      }));
      return saved;
    });
  }

  async listSalaryAdvanceHistory(id: string) {
    if (!await this.salaryAdvanceRepository.exist({ where: { id } })) {
      throw new NotFoundException('Không tìm thấy khoản tạm ứng');
    }
    return this.salaryAdvanceChangeLogRepository.find({
      where: { salary_advance_id: id },
      order: { created_at: 'DESC', id: 'DESC' },
    });
  }

  async upsertPayrollAdjustment(staffId: string, month: string, dto: UpsertPayrollAdjustmentDto) {
    this.monthBounds(month);
    if (!await this.staffRepository.exist({ where: { id: staffId } })) throw new NotFoundException('Không tìm thấy nhân sự');
    let adjustment = await this.payrollAdjustmentRepository.findOne({ where: { staff_member_id: staffId, payroll_month: month } });
    if (!adjustment) adjustment = this.payrollAdjustmentRepository.create({ staff_member_id: staffId, payroll_month: month });
    adjustment.reward_amount = String(dto.reward_amount);
    adjustment.note = dto.note?.trim() || null;
    return this.payrollAdjustmentRepository.save(adjustment);
  }

  private mapDto(dto: Partial<CreateStaffMemberDto>) {
    const moneyFields = ['base_salary', 'meal_allowance', 'transport_allowance', 'other_allowance', 'overtime_hourly_rate', 'standard_work_days', 'opening_salary_debt'] as const;
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined || key === 'employee_code' || key === 'full_name' || key === 'department_id' || key === 'position' || key === 'phone') continue;
      if ((moneyFields as readonly string[]).includes(key)) payload[key] = String(value);
      else if (typeof value === 'string') payload[key] = value.trim() || null;
      else payload[key] = value;
    }
    return payload;
  }

  private toResponse(entity: StaffMemberEntity, includeCompensation = false) {
    const { password_hash: _passwordHash, ...safeEntity } = entity;
    const safe = { ...safeEntity } as Record<string, unknown>;
    if (!includeCompensation) {
      for (const field of COMPENSATION_FIELDS) delete safe[field];
    }
    return safe;
  }

  private assertCanManageCompensation(dto: Partial<CreateStaffMemberDto>, currentUser: UserEntity) {
    if (isDirector(currentUser.role_mask)) return;
    if (COMPENSATION_FIELDS.some((field) => dto[field] !== undefined)) {
      throw new ForbiddenException('Chỉ Giám đốc được xem và chỉnh sửa thông tin lương');
    }
  }

  private salaryAdvanceSnapshot(
    advance: Pick<SalaryAdvanceEntity, 'advance_date' | 'amount' | 'note'>,
    staff: Pick<StaffMemberEntity, 'employee_code' | 'full_name'>,
    fund: Pick<CashFundEntity, 'code' | 'name'>,
    hub: Pick<HubEntity, 'code'> | null,
  ) {
    return {
      staff_member: `${staff.employee_code} · ${staff.full_name}`,
      advance_date: advance.advance_date,
      amount: Number(advance.amount || 0),
      fund: [fund.code, fund.name].filter(Boolean).join(' · '),
      hub: hub?.code || '—',
      note: advance.note || null,
    };
  }

  private buildSalaryAdvanceChanges(
    previous: ReturnType<StaffMemberService['salaryAdvanceSnapshot']> | null,
    next: ReturnType<StaffMemberService['salaryAdvanceSnapshot']>,
  ) {
    const changes: Record<string, SalaryAdvanceFieldChange> = {};
    for (const field of Object.keys(next) as Array<keyof typeof next>) {
      const oldValue = previous?.[field] ?? null;
      const newValue = next[field] ?? null;
      if (previous && oldValue === newValue) continue;
      changes[field] = { old_value: oldValue, new_value: newValue };
    }
    return changes;
  }

  private userDisplayName(user: UserEntity) {
    return user.full_name?.trim() || user.username?.trim() || 'Hệ thống';
  }

  private async getActiveDepartment(id: string) {
    const department = await this.departmentRepository.findOne({ where: { id, is_active: true } });
    if (!department) throw new BadRequestException('Bộ phận không tồn tại hoặc đã ngừng sử dụng');
    return department;
  }

  private async assertReferences(hubId?: string | null, userId?: string | null) {
    if (hubId) {
      const hub = await this.staffRepository.manager.getRepository(HubEntity).findOne({ where: { id: hubId, is_active: true } });
      if (!hub) throw new BadRequestException('Bưu cục không tồn tại hoặc đã ngừng sử dụng');
    }
    if (userId) {
      const user = await this.staffRepository.manager.getRepository(UserEntity).findOne({ where: { id: userId } });
      if (!user) throw new BadRequestException('Tài khoản liên kết không tồn tại');
    }
  }

  private async assertUnique(employeeCode: string, phone: string, userId?: string | null, ignoreId?: string) {
    const qb = this.staffRepository.createQueryBuilder('staff').where(new Brackets((inner) => {
      inner.where('UPPER(staff.employee_code) = UPPER(:employeeCode)', { employeeCode: employeeCode.trim() })
        .orWhere('staff.phone = :phone', { phone: phone.trim() });
      if (userId) inner.orWhere('staff.user_id = :userId', { userId });
    }));
    if (ignoreId) qb.andWhere('staff.id != :ignoreId', { ignoreId });
    if (await qb.getOne()) throw new ConflictException('Mã nhân sự, số điện thoại hoặc tài khoản liên kết đã tồn tại');
  }

  private async assertUniqueDepartment(code: string, name: string, ignoreId?: string) {
    const qb = this.departmentRepository.createQueryBuilder('department')
      .where('(UPPER(department.code) = UPPER(:code) OR LOWER(department.name) = LOWER(:name))', { code, name });
    if (ignoreId) qb.andWhere('department.id != :ignoreId', { ignoreId });
    if (await qb.getOne()) throw new ConflictException('Mã hoặc tên bộ phận đã tồn tại');
  }

  private monthBounds(month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('Tháng chấm công không hợp lệ');
    const [year, value] = month.split('-').map(Number);
    if (value < 1 || value > 12) throw new BadRequestException('Tháng chấm công không hợp lệ');
    const lastDay = new Date(Date.UTC(year, value, 0)).getUTCDate();
    return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
  }

  private calculatePayrollRow(staff: any, selectedMonth: string, attendance: StaffAttendanceEntity[], advances: SalaryAdvanceEntity[], adjustments: StaffPayrollAdjustmentEntity[], payments: StaffSalaryPaymentEntity[] = []) {
    const staffAttendance = attendance.filter((item) => String(item.staff_member_id) === String(staff.id));
    const staffAdvances = advances.filter((item) => String(item.staff_member_id) === String(staff.id));
    const staffAdjustments = adjustments.filter((item) => String(item.staff_member_id) === String(staff.id));
    const firstDataMonth = [staff.hire_date?.slice(0, 7), staffAttendance[0]?.work_date?.slice(0, 7), staffAdvances[0]?.advance_date?.slice(0, 7), selectedMonth].filter(Boolean).sort()[0] as string;
    let carry = -Number(staff.opening_salary_debt || 0);
    let selected: Record<string, number | string | null> = {};
    for (const cursor of this.monthSequence(firstDataMonth, selectedMonth)) {
      const monthAttendance = this.attendanceRecordsWithDefaults(staff, cursor, staffAttendance);
      const workDays = monthAttendance.reduce((sum, item) => sum + Number(item.work_days || 0), 0);
      const overtimeHours = monthAttendance.reduce((sum, item) => sum + Number(item.overtime_hours || 0), 0);
      const standardDays = Math.max(1, Number(staff.standard_work_days || 26));
      const baseSalary = Number(staff.base_salary || 0);
      const allowanceTotal = Number(staff.meal_allowance || 0) + Number(staff.transport_allowance || 0) + Number(staff.other_allowance || 0);
      const baseByAttendance = Math.round(baseSalary / standardDays * workDays);
      const allowanceByAttendance = Math.round(allowanceTotal / standardDays * workDays);
      const overtimePay = Math.round(Number(staff.overtime_hourly_rate || 0) * overtimeHours);
      const adjustment = staffAdjustments.find((item) => item.payroll_month === cursor);
      const rewardAmount = Number(adjustment?.reward_amount || 0);
      const advanceAmount = staffAdvances.filter((item) => item.advance_date.startsWith(cursor)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const carryIn = carry;
      const salaryBeforeAdvance = Math.round(baseByAttendance + allowanceByAttendance + overtimePay + rewardAmount);
      const netSalary = Math.round(salaryBeforeAdvance + carryIn - advanceAmount);
      carry = Math.min(0, netSalary);
      if (cursor === selectedMonth) {
        const payment = payments.find((item) => String(item.staff_member_id) === String(staff.id) && item.payroll_month === cursor);
        selected = { work_days: workDays, overtime_hours: overtimeHours, base_by_attendance: baseByAttendance, allowance_total: allowanceTotal, allowance_by_attendance: allowanceByAttendance, overtime_pay: overtimePay, reward_amount: rewardAmount, advance_amount: advanceAmount, carry_in: carryIn, gross_salary: salaryBeforeAdvance, net_salary: netSalary, carry_out: carry, payroll_note: adjustment?.note ?? null, salary_paid_amount: Number(payment?.amount || 0), salary_payment_id: payment?.id || null };
      }
    }
    return { ...staff, month: selectedMonth, ...selected };
  }

  private listStaffEmployedDuring(from: string, to: string) {
    return this.staffRepository.createQueryBuilder('staff')
      .leftJoinAndSelect('staff.department_record', 'department')
      .leftJoinAndSelect('staff.hub', 'hub')
      .leftJoin('staff.user', 'user')
      .addSelect(['user.id', 'user.username', 'user.full_name'])
      .where('(staff.hire_date IS NULL OR staff.hire_date <= :to)', { to })
      .andWhere("((staff.termination_date IS NULL AND staff.employment_status = 'ACTIVE') OR staff.termination_date >= :from)", { from })
      .orderBy('staff.employee_code', 'ASC')
      .getMany();
  }

  private attendanceRecordsWithDefaults(staff: Pick<StaffMemberEntity, 'id' | 'hire_date' | 'termination_date'>, month: string, records: StaffAttendanceEntity[]) {
    const { from, to } = this.monthBounds(month);
    const start = staff.hire_date && staff.hire_date > from ? staff.hire_date : from;
    const end = staff.termination_date && staff.termination_date < to ? staff.termination_date : to;
    if (start > end) return [];
    const saved = new Map(records
      .filter((item) => String(item.staff_member_id) === String(staff.id) && item.work_date >= start && item.work_date <= end)
      .map((item) => [item.work_date, item]));
    const result: Array<StaffAttendanceEntity | Record<string, unknown>> = [];
    for (let day = new Date(`${start}T00:00:00Z`); day <= new Date(`${end}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
      const date = day.toISOString().slice(0, 10);
      result.push(saved.get(date) || {
        id: `default-${staff.id}-${date}`,
        staff_member_id: staff.id,
        work_date: date,
        work_days: '1',
        overtime_hours: '0',
        note: null,
      });
    }
    return result as StaffAttendanceEntity[];
  }

  private assertEmploymentDates(hireDate?: string | null, terminationDate?: string | null) {
    if (hireDate && terminationDate && terminationDate < hireDate) {
      throw new BadRequestException('Ngày nghỉ việc không được trước ngày vào làm');
    }
  }

  private monthSequence(from: string, to: string): string[] {
    const [startYear, startMonth] = from.split('-').map(Number);
    const [endYear, endMonth] = to.split('-').map(Number);
    const result: string[] = [];
    for (let year = startYear, month = startMonth; year < endYear || year === endYear && month <= endMonth; month += 1) {
      if (month === 13) { year += 1; month = 1; }
      result.push(`${year}-${String(month).padStart(2, '0')}`);
    }
    return result;
  }
}
