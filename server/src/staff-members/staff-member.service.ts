import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { HubEntity } from '../hubs/hub.entity';
import { UserEntity } from '../users/user.entity';
import { CreateStaffMemberDto } from './dto/create-staff-member.dto';
import { QueryStaffMemberDto } from './dto/query-staff-member.dto';
import { CreateStaffDepartmentDto, UpdateStaffDepartmentDto } from './dto/staff-department.dto';
import { UpdateStaffMemberDto } from './dto/update-staff-member.dto';
import { UpsertStaffAttendanceDto } from './dto/upsert-staff-attendance.dto';
import { StaffAttendanceEntity } from './staff-attendance.entity';
import { StaffDepartmentEntity } from './staff-department.entity';
import { StaffMemberEntity } from './staff-member.entity';

@Injectable()
export class StaffMemberService {
  constructor(
    @InjectRepository(StaffMemberEntity) private readonly staffRepository: Repository<StaffMemberEntity>,
    @InjectRepository(StaffDepartmentEntity) private readonly departmentRepository: Repository<StaffDepartmentEntity>,
    @InjectRepository(StaffAttendanceEntity) private readonly attendanceRepository: Repository<StaffAttendanceEntity>,
  ) {}

  async list(query: QueryStaffMemberDto) {
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
    return { data: data.map((item) => this.toResponse(item)), total, page, limit };
  }

  async findOne(id: string) {
    const entity = await this.staffRepository.findOne({ where: { id }, relations: ['department_record', 'hub', 'user'] });
    if (!entity) throw new NotFoundException('Không tìm thấy nhân sự');
    return this.toResponse(entity);
  }

  async create(dto: CreateStaffMemberDto) {
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
    return this.toResponse(await this.staffRepository.save(entity));
  }

  async update(id: string, dto: UpdateStaffMemberDto) {
    const entity = await this.staffRepository.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Không tìm thấy nhân sự');
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
    return this.toResponse(await this.staffRepository.save(entity));
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
    const [staffPage, monthRecords] = await Promise.all([
      this.list({ page: 1, limit: 500, employment_status: 'ACTIVE' }),
      this.attendanceRepository.createQueryBuilder('attendance')
        .where('attendance.work_date BETWEEN :from AND :to', { from, to })
        .orderBy('attendance.work_date', 'ASC')
        .getMany(),
    ]);
    return { staff: staffPage.data, records: monthRecords };
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
    const attendance = await this.listAttendance(month);
    const totals = new Map<string, { work_days: number; overtime_hours: number }>();
    for (const record of attendance.records) {
      const current = totals.get(String(record.staff_member_id)) ?? { work_days: 0, overtime_hours: 0 };
      current.work_days += Number(record.work_days || 0);
      current.overtime_hours += Number(record.overtime_hours || 0);
      totals.set(String(record.staff_member_id), current);
    }
    return attendance.staff.map((staff) => {
      const total = totals.get(String(staff.id)) ?? { work_days: 0, overtime_hours: 0 };
      const baseSalary = Number(staff.base_salary || 0);
      const standardDays = Math.max(1, Number(staff.standard_work_days || 26));
      const baseByAttendance = baseSalary / standardDays * total.work_days;
      const allowances = Number(staff.meal_allowance || 0) + Number(staff.transport_allowance || 0) + Number(staff.other_allowance || 0);
      const overtimePay = Number(staff.overtime_hourly_rate || 0) * total.overtime_hours;
      return {
        ...staff,
        month,
        work_days: total.work_days,
        overtime_hours: total.overtime_hours,
        base_by_attendance: baseByAttendance,
        allowance_total: allowances,
        overtime_pay: overtimePay,
        gross_salary: baseByAttendance + allowances + overtimePay,
      };
    });
  }

  private mapDto(dto: Partial<CreateStaffMemberDto>) {
    const moneyFields = ['base_salary', 'meal_allowance', 'transport_allowance', 'other_allowance', 'overtime_hourly_rate', 'standard_work_days'] as const;
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined || key === 'employee_code' || key === 'full_name' || key === 'department_id' || key === 'position' || key === 'phone') continue;
      if ((moneyFields as readonly string[]).includes(key)) payload[key] = String(value);
      else if (typeof value === 'string') payload[key] = value.trim() || null;
      else payload[key] = value;
    }
    return payload;
  }

  private toResponse(entity: StaffMemberEntity) {
    const { password_hash: _passwordHash, ...safe } = entity;
    return safe;
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
}
