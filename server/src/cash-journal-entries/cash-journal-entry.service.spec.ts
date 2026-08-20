import { BadRequestException } from '@nestjs/common';
import { Roles } from '../common/roles';
import { CashFundEntity } from '../finance/cash-fund.entity';
import { HubEntity } from '../hubs/hub.entity';
import { VendorEntity } from '../vendors/vendor.entity';
import { CashJournalEntryService } from './cash-journal-entry.service';

const currentUser = {
  id: '9',
  username: 'accountant',
  full_name: 'Kế toán',
  role_mask: Roles.MANAGER,
} as any;

const persistedEntry = {
  id: '1',
  entry_date: '2026-08-20',
  voucher_type: 'Chi',
  source: 'Nội bộ',
  fund_id: 'fund-1',
  vendor_id: null,
  hub_id: '10',
  cost_category: 'Chi phí văn phòng',
  detail: 'Phòng kế toán',
  content: 'Mua văn phòng phẩm',
  note: null,
  income_amount: '0',
  expense_amount: '1000',
  fund: { id: 'fund-1', hub_id: '10' },
  hub: { id: '10', code: 'HAN' },
};

const createRepository = () => {
  const fundRepository = {
    findOne: jest.fn(async () => ({ id: 'fund-1', code: 'TM-HAN', is_active: true, hub_id: '10' })),
  };
  const hubRepository = { findOne: jest.fn(async () => ({ id: '10', code: 'HAN', is_active: true })) };
  const vendorRepository = { findOne: jest.fn(async () => null) };
  return {
    query: jest.fn()
      .mockResolvedValueOnce([{ total: 1, total_income: '850000', total_expense: '1000' }])
      .mockResolvedValueOnce([{ ...persistedEntry, editable: true }]),
    create: jest.fn((payload) => payload),
    save: jest.fn(async (payload) => ({ id: '1', ...payload })),
    findOne: jest.fn(async ({ where }: any) => (where.id === 'missing' ? null : persistedEntry)),
    remove: jest.fn(async () => persistedEntry),
    manager: {
      getRepository: jest.fn((entity) => {
        if (entity === CashFundEntity) return fundRepository;
        if (entity === HubEntity) return hubRepository;
        if (entity === VendorEntity) return vendorRepository;
        throw new Error(`Unexpected repository: ${String(entity)}`);
      }),
    },
  };
};

describe('CashJournalEntryService', () => {
  let service: CashJournalEntryService;
  let repository: ReturnType<typeof createRepository>;

  beforeEach(() => {
    repository = createRepository();
    service = new CashJournalEntryService(repository as any);
  });

  it('lists the unified journal with income, expense, and balance metadata', async () => {
    await expect(service.list({ page: 1, limit: 20 }, currentUser)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: '1', expense_amount: 1000 })],
      meta: {
        total: 1,
        page: 1,
        limit: 20,
        total_income: 850000,
        total_expense: 1000,
        balance: 849000,
      },
    });
  });

  it('creates, updates, finds, and removes a fund-linked manual expense', async () => {
    await expect(service.create({
      entry_date: '2026-08-20',
      voucher_type: 'Chi',
      source: 'Nội bộ',
      fund_id: 'fund-1',
      hub_id: '10',
      cost_category: 'Chi phí văn phòng',
      detail: 'Phòng kế toán',
      content: 'Mua văn phòng phẩm',
      income_amount: 0,
      expense_amount: 1000,
      attachment_urls: ['https://example.com/receipt.jpg'],
    }, currentUser)).resolves.toMatchObject({ id: '1', fund_id: 'fund-1', hub_id: '10', expense_amount: '1000' });
    await expect(service.update('1', { content: 'Đã cập nhật' }, currentUser)).resolves.toMatchObject({ id: '1', content: 'Đã cập nhật' });
    await expect(service.findOne('1', currentUser)).resolves.toMatchObject({ id: '1' });
    await expect(service.remove('1', currentUser)).resolves.toBeUndefined();
    expect(repository.remove).toHaveBeenCalledWith(persistedEntry);
  });

  it('requires a hub when an expense uses a system-wide cash fund', async () => {
    const fundRepository = repository.manager.getRepository(CashFundEntity) as any;
    fundRepository.findOne.mockResolvedValue({ id: 'fund-1', code: 'TM-CHUNG', is_active: true, hub_id: null });
    await expect(service.create({
      entry_date: '2026-08-20',
      voucher_type: 'Chi',
      source: 'Nội bộ',
      fund_id: 'fund-1',
      cost_category: 'Chi phí văn phòng',
      detail: 'Phòng kế toán',
      content: 'Mua văn phòng phẩm',
      income_amount: 0,
      expense_amount: 1000,
    }, currentUser)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('includes trip expenses in the unified journal query', async () => {
    await service.list({ page: 1, limit: 20 }, currentUser);
    expect(repository.query.mock.calls[0][0]).toContain("'TRIP_EXPENSE'::varchar");
    expect(repository.query.mock.calls[0][0]).toContain('expense.receipt_urls');
  });
});
