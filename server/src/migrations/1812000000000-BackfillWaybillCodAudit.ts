import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillWaybillCodAudit1812000000000 implements MigrationInterface {
  name = 'BackfillWaybillCodAudit1812000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "waybill_change_logs"
        ("waybill_id", "action", "changes", "changed_by_id", "changed_by_name", "created_at")
      SELECT
        waybill."id",
        'COD_RECONCILED',
        jsonb_build_object(
          'cod_reconciled_at', jsonb_build_object('old_value', NULL, 'new_value', waybill."cod_reconciled_at"),
          'cod_collected_amount', jsonb_build_object('old_value', 0, 'new_value', COALESCE(waybill."cod_collected_amount", 0)),
          'cod_fund_id', jsonb_build_object('old_value', NULL, 'new_value', waybill."cod_fund_id")
        ),
        waybill."cod_reconciled_by",
        COALESCE(NULLIF(BTRIM("user"."full_name"), ''), NULLIF(BTRIM("user"."username"), ''), 'Hệ thống'),
        waybill."cod_reconciled_at"
      FROM "waybills" waybill
      LEFT JOIN "users" "user" ON "user"."id" = waybill."cod_reconciled_by"
      WHERE waybill."cod_reconciled_at" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "waybill_change_logs" log
          WHERE log."waybill_id" = waybill."id"
            AND log."action" = 'COD_RECONCILED'
        )
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Audit records are business data and must remain intact when reverting code.
  }
}
