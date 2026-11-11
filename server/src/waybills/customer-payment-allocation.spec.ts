import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Roles } from '../common/roles';
import { UserEntity } from '../users/user.entity';
import { allocateCustomerPayment, syncCustomerReceipt } from './customer-payment-allocation';

describe('customer receipt allocation', () => {
  it('spreads an unmatched amount across all outstanding debts', () => {
    expect(allocateCustomerPayment(333, [100, 300, 600])).toEqual([34, 100, 199]);
  });

  it('clears all balances with the final payment', () => {
    const balances = [100, 300, 600];
    const first = allocateCustomerPayment(333, balances);
    const remaining = balances.map((balance, index) => Math.round((balance - first[index]) * 100) / 100);
    expect(allocateCustomerPayment(667, remaining)).toEqual(remaining);
  });

  it('preserves cents exactly and never allocates beyond an outstanding balance', () => {
    for (const amount of [0.01, 0.02, 0.05, 1, 100, 600]) {
      const balances = [100, 200, 300];
      const allocated = allocateCustomerPayment(amount, balances);
      expect(Math.round(allocated.reduce((sum, value) => sum + value, 0) * 100)).toBe(Math.round(amount * 100));
      allocated.forEach((value, index) => expect(value).toBeLessThanOrEqual(balances[index]));
    }
    expect(allocateCustomerPayment(10, [0, 10, 0])).toEqual([0, 10, 0]);
  });

  it.each([0, -1, 1001])('rejects invalid or excessive receipts (%s)', (amount) => {
    expect(() => allocateCustomerPayment(amount, [100, 900])).toThrow(BadRequestException);
  });

  const user = { id: '9', username: 'accountant', role_mask: Roles.MANAGER } as UserEntity;
  const journal = { id: '10', customer_code: 'kh1', voucher_type: 'Thu', income_amount: '500', fund_id: '3' };
  function createManager() {
    const query = jest.fn(async (sql: string, _params?: unknown[]): Promise<any[]> => {
      if (sql.includes('SELECT DISTINCT')) return [];
      if (sql.includes('SELECT id FROM customers')) return [{ id: '1' }];
      if (sql.includes('SELECT id, code, opening_debt')) return [{ id: '1', code: 'KH1', opening_debt: '100' }];
      if (sql.includes('FROM waybills WHERE')) return [
        { id: '2', waybill_code: 'B2', due: '300', origin_hub_id: '1', dest_hub_id: '2' },
        { id: '3', waybill_code: 'B3', due: '600', origin_hub_id: '1', dest_hub_id: '2' },
      ];
      if (sql.includes('GROUP BY waybill_id')) return [];
      if (sql.includes("source_type = 'OPENING_DEBT'")) return [{ amount: '0' }];
      return [];
    });
    return { query };
  }

  it('locks the account and records opening/bill allocations linked to one journal', async () => {
    const manager = createManager();
    await syncCustomerReceipt(manager as unknown as EntityManager, journal, user);
    const inserts = manager.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO')) as unknown as Array<[string, unknown[]]>;
    expect(inserts.map(([, values]) => values[5])).toEqual([50, 150, 300]);
    expect(inserts.every(([, values]) => values[11] === journal.id)).toBe(true);
    expect(manager.query.mock.calls.some(([sql]) => sql.includes('FOR UPDATE'))).toBe(true);
    expect(manager.query.mock.calls.some(([sql]) => sql.includes("THEN 'PARTIAL'"))).toBe(true);
  });

  it('removes allocations and recalculates status when a receipt is removed', async () => {
    const manager = createManager();
    manager.query.mockResolvedValueOnce([{ customer_code: 'KH1' }]);
    await syncCustomerReceipt(manager as unknown as EntityManager, { ...journal, customer_code: null }, user);
    const sql = manager.query.mock.calls.map(([statement]) => statement);
    expect(sql.some((statement) => statement.startsWith('DELETE FROM waybill_cash_vouchers'))).toBe(true);
    expect(sql.some((statement) => statement.includes('UPDATE waybills'))).toBe(true);
    expect(sql.some((statement) => statement.startsWith('INSERT'))).toBe(false);
  });

  it('rejects customer receipts spanning another hub for scoped accountants', async () => {
    const manager = createManager();
    await expect(syncCustomerReceipt(manager as unknown as EntityManager, journal, { ...user, role_mask: Roles.ACCOUNTANT, user_hubs: [] } as unknown as UserEntity)).rejects.toThrow(ForbiddenException);
    expect(manager.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false);
  });

  it('does not overcollect when another bill already has a customer credit/COD surplus', async () => {
    const manager = createManager();
    const original = manager.query.getMockImplementation()!;
    manager.query.mockImplementation(async (sql, params) => sql.includes('GROUP BY waybill_id')
      ? [{ waybill_id: '2', amount: '400' }]
      : original(sql, params));
    await expect(syncCustomerReceipt(manager as unknown as EntityManager, { ...journal, income_amount: '700' }, user)).rejects.toThrow(BadRequestException);
    expect(manager.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false);
  });
});
