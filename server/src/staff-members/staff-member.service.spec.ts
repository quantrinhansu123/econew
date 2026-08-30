import { StaffMemberService } from './staff-member.service';

const createQueryBuilder = () => ({
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orWhere: jest.fn().mockReturnThis(),
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  execute: jest.fn(async () => ({ affected: 1 })),
  getMany: jest.fn(async () => []),
  getManyAndCount: jest.fn(async () => [[{ id: '1', employee_code: 'NV001', full_name: 'Sample', base_salary: '8000000' }], 1]),
  getOne: jest.fn(async () => null),
});

const createStaffRepository = () => {
  const qb = createQueryBuilder();
  return {
    manager: {
      getRepository: jest.fn(() => ({ findOne: jest.fn(async () => ({ id: '1' })) })),
    },
    create: jest.fn((payload) => payload),
    save: jest.fn(async (payload) => ({ id: '1', ...payload })),
    findOne: jest.fn(async ({ where }: any) => (where.id === 'missing' ? null : {
      id: where.id,
      employee_code: 'NV001',
      full_name: 'Sample',
      phone: '0900000000',
      department_id: '10',
      employment_status: 'ACTIVE',
    })),
    createQueryBuilder: jest.fn(() => qb),
  };
};

const createDepartmentRepository = () => ({
  create: jest.fn((payload) => payload),
  save: jest.fn(async (payload) => ({ id: '10', ...payload })),
  find: jest.fn(async () => []),
  findOne: jest.fn(async ({ where }: any) => (where.id === 'missing' ? null : {
    id: where.id,
    code: 'KHO',
    name: 'Kho',
    is_active: true,
  })),
  createQueryBuilder: jest.fn(() => createQueryBuilder()),
});

const createAttendanceRepository = () => ({
  create: jest.fn((payload) => payload),
  save: jest.fn(async (payload) => ({ id: '20', ...payload })),
  findOne: jest.fn(async () => null),
  createQueryBuilder: jest.fn(() => createQueryBuilder()),
});

describe('StaffMemberService', () => {
  let service: StaffMemberService;
  let staffRepository: ReturnType<typeof createStaffRepository>;
  let departmentRepository: ReturnType<typeof createDepartmentRepository>;

  beforeEach(() => {
    staffRepository = createStaffRepository();
    departmentRepository = createDepartmentRepository();
    service = new StaffMemberService(
      staffRepository as any,
      departmentRepository as any,
      createAttendanceRepository() as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('lists records with paging metadata', async () => {
    await expect(service.list({ page: 1, limit: 20 })).resolves.toMatchObject({ total: 1, page: 1, limit: 20 });
  });

  it('only returns compensation fields to directors', async () => {
    const accountant = await service.list({ page: 1, limit: 20 }, { role_mask: 16 } as any);
    const director = await service.list({ page: 1, limit: 20 }, { role_mask: 64 } as any);

    expect(accountant.data[0]).not.toHaveProperty('base_salary');
    expect(director.data[0]).toHaveProperty('base_salary', '8000000');
  });

  it('creates an employee without a login account', async () => {
    const result = await service.create({
      employee_code: 'nv001',
      full_name: 'Nguyen A',
      department_id: '10',
      position: 'Nhan vien',
      phone: '0900000000',
      base_salary: 8_000_000,
    }, { id: '99', role_mask: 64 } as any);

    expect(departmentRepository.findOne).toHaveBeenCalledWith({ where: { id: '10', is_active: true } });
    expect(staffRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      employee_code: 'NV001',
      department: 'Kho',
      password_hash: null,
    }));
    expect(result).not.toHaveProperty('password_hash');
  });

  it('updates, finds, and deactivates an employee', async () => {
    await expect(service.update('1', { full_name: 'Updated' }, { id: '99', role_mask: 16 } as any)).resolves.toMatchObject({ id: '1', full_name: 'Updated' });
    await expect(service.findOne('1')).resolves.toMatchObject({ id: '1' });
    await expect(service.remove('1')).resolves.toBeUndefined();
    expect(staffRepository.save).toHaveBeenLastCalledWith(expect.objectContaining({ employment_status: 'INACTIVE' }));
  });

  it('rejects compensation changes from non-directors', async () => {
    await expect(service.update('1', { base_salary: 9_000_000 }, { id: '99', role_mask: 16 } as any))
      .rejects.toThrow('Chỉ Giám đốc');
  });

  it('defaults attendance to one work day only inside the employment period', () => {
    const records = (service as any).attendanceRecordsWithDefaults({
      id: '1',
      hire_date: '2026-08-10',
      termination_date: '2026-08-12',
    }, '2026-08', []);

    expect(records.map((item: any) => [item.work_date, Number(item.work_days)])).toEqual([
      ['2026-08-10', 1],
      ['2026-08-11', 1],
      ['2026-08-12', 1],
    ]);
  });

  it('rounds payroll amounts to whole dong while keeping the existing formula', () => {
    const attendance = Array.from({ length: 31 }, (_, index) => ({
      staff_member_id: '1',
      work_date: `2026-08-${String(index + 1).padStart(2, '0')}`,
      work_days: index < 22 ? '1' : index === 22 ? '0.5' : '0',
      overtime_hours: '0',
    }));
    const row = (service as any).calculatePayrollRow({
      id: '1',
      hire_date: '2026-08-01',
      termination_date: null,
      base_salary: '5310000',
      meal_allowance: '0',
      transport_allowance: '0',
      other_allowance: '0',
      overtime_hourly_rate: '0',
      standard_work_days: '26',
      opening_salary_debt: '0',
    }, '2026-08', attendance, [], []);

    expect(row.base_by_attendance).toBe(4_595_192);
    expect(row.net_salary).toBe(4_595_192);
  });
});
