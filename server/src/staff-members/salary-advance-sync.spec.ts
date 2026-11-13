import { CashJournalEntryEntity } from '../cash-journal-entries/cash-journal-entry.entity';
import { CashFundEntity } from '../finance/cash-fund.entity';
import { HubEntity } from '../hubs/hub.entity';
import { SalaryAdvanceEntity } from './salary-advance.entity';
import { SalaryAdvanceChangeLogEntity } from './salary-advance-change-log.entity';
import { StaffMemberService } from './staff-member.service';
import { StaffPayrollAdjustmentEntity } from './staff-payroll-adjustment.entity';

describe('salary advance payroll synchronization', () => {
  function setup() {
    const staff = [
      { id: '1', employee_code: 'HN0001', full_name: 'Linh', hub_id: '3', employment_status: 'ACTIVE' },
      { id: '2', employee_code: 'HN0002', full_name: 'Son', hub_id: '3', employment_status: 'ACTIVE' },
    ];
    const advance = {
      id: '10', staff_member_id: '1', advance_date: '2026-10-15', amount: '3900000',
      fund_id: '4', hub_id: '3', cash_journal_entry_id: '20', note: null,
    };
    const advanceRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value })),
      findOne: jest.fn(async () => advance),
    };
    const journalRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: '20', ...value })),
      findOne: jest.fn(async () => ({ id: '20' })),
    };
    const adjustmentRepository = { update: jest.fn(async () => ({ affected: 1 })) };
    const fundRepository = { findOne: jest.fn(async () => ({ id: '4', hub_id: '3', name: 'Quỹ HAN' })) };
    const hubRepository = { findOne: jest.fn(async () => ({ id: '3', code: 'HAN' })) };
    const logRepository = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === SalaryAdvanceEntity) return advanceRepository;
        if (entity === CashJournalEntryEntity) return journalRepository;
        if (entity === StaffPayrollAdjustmentEntity) return adjustmentRepository;
        if (entity === CashFundEntity) return fundRepository;
        if (entity === HubEntity) return hubRepository;
        if (entity === SalaryAdvanceChangeLogEntity) return logRepository;
        throw new Error(`Unexpected repository: ${String(entity)}`);
      }),
    };
    const staffRepository = {
      findOne: jest.fn(async ({ where }) => staff.find((item) => item.id === where.id)),
      manager: { ...manager, transaction: jest.fn(async (callback) => callback(manager)) },
    };
    const service = Object.create(StaffMemberService.prototype) as StaffMemberService;
    Object.assign(service, { staffRepository, salaryAdvanceRepository: advanceRepository, cashFundRepository: fundRepository });
    const user = { id: '99', username: 'admin', role_mask: 64 } as any;
    return { service, user, adjustmentRepository, journalRepository };
  }

  it('returns a previously saved payroll to automatic advances when a voucher is entered later', async () => {
    const { service, user, adjustmentRepository } = setup();
    await service.createSalaryAdvance({ staff_member_id: '1', advance_date: '2026-10-31', amount: 3_900_000, fund_id: '4' }, user);
    expect(adjustmentRepository.update).toHaveBeenCalledWith(
      { staff_member_id: '1', payroll_month: '2026-10' }, { advance_override: null },
    );
  });

  it('releases saved amounts for both employees and months when a voucher is reassigned', async () => {
    const { service, user, adjustmentRepository, journalRepository } = setup();
    await service.updateSalaryAdvance('10', { staff_member_id: '2', advance_date: '2026-11-01', amount: 2_000_000 }, user);
    expect(adjustmentRepository.update.mock.calls).toEqual([
      [{ staff_member_id: '1', payroll_month: '2026-10' }, { advance_override: null }],
      [{ staff_member_id: '2', payroll_month: '2026-11' }, { advance_override: null }],
    ]);
    expect(journalRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      entry_date: '2026-11-01', expense_amount: '2000000', detail: 'HN0002 · Son',
    }));
  });
});
