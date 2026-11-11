import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { isManager } from '../common/roles';
import { getAssignedHubIds } from '../common/user-hub-scope';
import { UserEntity } from '../users/user.entity';

/** Preserve whole VND for whole-VND debts, and cents for legacy fractional amounts. */
export function allocateCustomerPayment(amount: number, balances: number[]): number[] {
  if (!Number.isFinite(amount) || balances.some((value) => !Number.isFinite(value))) {
    throw new BadRequestException('Số tiền không hợp lệ');
  }
  const scale = Number.isInteger(amount) && balances.every(Number.isInteger) ? 1 : 100;
  const cents = balances.map((value) => BigInt(Math.max(0, Math.round(value * scale))));
  const total = cents.reduce((sum, value) => sum + value, 0n);
  const payment = BigInt(Math.round(amount * scale));
  if (payment <= 0n || payment > total) throw new BadRequestException('Số tiền phải lớn hơn 0 và không vượt quá dư nợ khách hàng');
  const allocated = cents.map((value) => payment * value / total);
  let remainder = payment - allocated.reduce((sum, value) => sum + value, 0n);
  for (let i = 0; remainder > 0n; i = (i + 1) % cents.length) {
    if (allocated[i] < cents[i]) { allocated[i] += 1n; remainder -= 1n; }
  }
  return allocated.map((value) => Number(value) / scale);
}

/** Called inside the journal transaction. Allocations affect debt, the journal affects cash. */
export async function syncCustomerReceipt(
  manager: EntityManager,
  journal: { id: string; customer_code?: string | null; voucher_type: string; income_amount: string; note?: string | null; fund_id: string | null; attachment_urls?: string[]; entry_date?: string },
  user: UserEntity,
) {
  const codes = await manager.query('SELECT DISTINCT customer_code FROM waybill_cash_vouchers WHERE journal_entry_id = $1', [journal.id]) as Array<{ customer_code: string }>;
  const customerCode = journal.customer_code?.trim().toUpperCase();
  // Lock accounts in a stable order before replacing old allocations.
  const accountCodes = [...new Set([...codes.map((row) => row.customer_code.trim().toUpperCase()), customerCode].filter(Boolean))].sort();
  for (const code of accountCodes) {
    const customers = await manager.query('SELECT id FROM customers WHERE UPPER(TRIM(code)) = $1 AND deleted_at IS NULL FOR UPDATE', [code]);
    if (code === customerCode && !customers.length) throw new NotFoundException(`Không tìm thấy mã KH ${code}`);
    await manager.query(`SELECT id FROM waybills WHERE deleted_at IS NULL
      AND UPPER(TRIM(COALESCE(NULLIF(TRIM(ma_kh), ''), (regexp_match(note, 'ma_kh=([^|]+)', 'i'))[1]))) = $1
      ORDER BY id FOR UPDATE`, [code]);
  }
  await manager.query('DELETE FROM waybill_cash_vouchers WHERE journal_entry_id = $1', [journal.id]);
  if (customerCode && journal.voucher_type === 'Thu') {
    const [customer] = await manager.query('SELECT id, code, opening_debt FROM customers WHERE UPPER(TRIM(code)) = $1 AND deleted_at IS NULL', [customerCode]);
    const bills = await manager.query(`SELECT id, waybill_code, origin_hub_id, dest_hub_id,
      COALESCE(freight_amount, cost_amount, 0)::numeric AS due
      FROM waybills WHERE deleted_at IS NULL
      AND UPPER(TRIM(COALESCE(NULLIF(TRIM(ma_kh), ''), (regexp_match(note, 'ma_kh=([^|]+)', 'i'))[1]))) = $1
      ORDER BY id FOR UPDATE`, [customerCode]) as Array<{ id: string; waybill_code: string; origin_hub_id: string; dest_hub_id: string; due: string }>;
    if (!isManager(user.role_mask)) {
      const hubs = getAssignedHubIds(user);
      if (bills.some((bill) => !hubs.includes(String(bill.origin_hub_id)) && !hubs.includes(String(bill.dest_hub_id)))) {
        throw new ForbiddenException('Không được thanh toán công nợ khách hàng có đơn thuộc bưu cục khác');
      }
    }
    const paid = await manager.query(`SELECT waybill_id, COALESCE(SUM(CASE WHEN LOWER(voucher_type) = 'thu' THEN amount ELSE -amount END), 0) AS amount
      FROM waybill_cash_vouchers WHERE waybill_id = ANY($1::bigint[]) GROUP BY waybill_id`, [bills.map((bill) => bill.id)]) as Array<{ waybill_id: string; amount: string }>;
    const paidMap = new Map(paid.map((row) => [String(row.waybill_id), Number(row.amount)]));
    const [opening] = await manager.query(`SELECT COALESCE(SUM(CASE WHEN LOWER(voucher_type) = 'thu' THEN amount ELSE -amount END), 0) AS amount
      FROM waybill_cash_vouchers WHERE customer_id = $1 AND source_type = 'OPENING_DEBT'`, [customer.id]);
    const netDebt = Math.max(0, Number(customer.opening_debt) - Number(opening.amount))
      + bills.reduce((sum, bill) => sum + Number(bill.due) - (paidMap.get(String(bill.id)) ?? 0), 0);
    if (Number(journal.income_amount) > Math.round(netDebt * 100) / 100) {
      throw new BadRequestException('Số tiền vượt quá dư nợ khách hàng sau khi đối trừ tiền dư/COD');
    }
    const balances = [Math.max(0, Number(customer.opening_debt) - Number(opening.amount)), ...bills.map((bill) => Math.max(0, Number(bill.due) - (paidMap.get(String(bill.id)) ?? 0)))];
    const allocations = allocateCustomerPayment(Number(journal.income_amount), balances);
    for (let i = 0; i < allocations.length; i += 1) {
      if (allocations[i] <= 0) continue;
      const bill = i === 0 ? null : bills[i - 1];
      await manager.query(`INSERT INTO waybill_cash_vouchers
        (waybill_id, waybill_code, customer_id, customer_code, voucher_type, source_type, amount, fund_id, note, image_url, created_by_id, created_by_name, journal_entry_id, created_at)
        VALUES ($1, $2, $3, $4, 'Thu', $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13::timestamp, CURRENT_TIMESTAMP))`,
      [bill?.id ?? null, bill?.waybill_code ?? null, customer.id, customer.code, bill ? 'MANUAL' : 'OPENING_DEBT', allocations[i], journal.fund_id, journal.note || null, journal.attachment_urls?.[0] || null, user.id, user.full_name?.trim() || user.username, journal.id, journal.entry_date ?? null]);
    }
  }
  // Include deleted/reassigned receipts' accounts so editing/removing a receipt reverses its status.
  for (const code of accountCodes) {
    if (journal.voucher_type !== 'Thu' && !codes.some((row) => row.customer_code.trim().toUpperCase() === code)) continue;
    await manager.query(`WITH balances AS (
        SELECT b.id, COALESCE(b.freight_amount, b.cost_amount, 0) AS due,
          COALESCE(SUM(CASE WHEN LOWER(v.voucher_type) = 'thu' THEN v.amount ELSE -v.amount END), 0) AS paid
        FROM waybills b LEFT JOIN waybill_cash_vouchers v ON v.waybill_id = b.id
        WHERE b.deleted_at IS NULL AND UPPER(TRIM(COALESCE(NULLIF(TRIM(b.ma_kh), ''), (regexp_match(b.note, 'ma_kh=([^|]+)', 'i'))[1]))) = $1 GROUP BY b.id
      ), account AS (
        SELECT COALESCE(SUM(due - paid), 0) + COALESCE((
          SELECT GREATEST(0, c.opening_debt - COALESCE((
            SELECT SUM(CASE WHEN LOWER(voucher_type) = 'thu' THEN amount ELSE -amount END)
            FROM waybill_cash_vouchers WHERE customer_id = c.id AND source_type = 'OPENING_DEBT'
          ), 0)) FROM customers c WHERE UPPER(TRIM(c.code)) = $1 AND c.deleted_at IS NULL
        ), 0) AS debt FROM balances
      )
      UPDATE waybills w SET customer_payment_status = CASE
      WHEN account.debt <= 0 OR p.paid >= p.due THEN 'PAID'::waybills_customer_payment_status_enum
      WHEN p.paid > 0 THEN 'PARTIAL'::waybills_customer_payment_status_enum
      WHEN w.customer_payment_status = 'SENT_STATEMENT' THEN w.customer_payment_status
      ELSE NULL END
      FROM balances p CROSS JOIN account
      WHERE w.id = p.id`, [code]);
  }
}
