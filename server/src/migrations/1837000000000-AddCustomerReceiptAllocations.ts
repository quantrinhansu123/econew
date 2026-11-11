import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerReceiptAllocations1837000000000 implements MigrationInterface {
  // PostgreSQL must commit a new enum value before it can be used by the backfill.
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE waybills_customer_payment_status_enum ADD VALUE IF NOT EXISTS 'PARTIAL'`);
    await queryRunner.query(`ALTER TABLE cash_journal_entries ADD COLUMN IF NOT EXISTS customer_code varchar(64)`);
    await queryRunner.query(`ALTER TABLE waybill_cash_vouchers ADD COLUMN IF NOT EXISTS journal_entry_id bigint REFERENCES cash_journal_entries(id) ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_waybill_cash_vouchers_journal ON waybill_cash_vouchers(journal_entry_id)`);
    await queryRunner.query(`UPDATE waybills w SET customer_payment_status = CASE
      WHEN paid.amount >= COALESCE(w.freight_amount, w.cost_amount, 0) THEN 'PAID'::waybills_customer_payment_status_enum
      ELSE 'PARTIAL'::waybills_customer_payment_status_enum END
      FROM (SELECT waybill_id, SUM(CASE WHEN LOWER(voucher_type) = 'thu' THEN amount ELSE -amount END) AS amount
        FROM waybill_cash_vouchers WHERE waybill_id IS NOT NULL GROUP BY waybill_id) paid
      WHERE w.id = paid.waybill_id AND w.deleted_at IS NULL AND paid.amount > 0`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Preserve financial allocations; rolling back while receipts exist must be explicit.
    await queryRunner.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM waybill_cash_vouchers WHERE journal_entry_id IS NOT NULL) THEN RAISE EXCEPTION 'Customer receipt allocations must be reversed before rollback'; END IF; END $$`);
    await queryRunner.query(`ALTER TABLE waybill_cash_vouchers DROP COLUMN IF EXISTS journal_entry_id`);
    await queryRunner.query(`ALTER TABLE cash_journal_entries DROP COLUMN IF EXISTS customer_code`);
  }
}
