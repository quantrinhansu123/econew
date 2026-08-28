import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSalaryAdvanceAudit1822000000000 implements MigrationInterface {
  name = 'AddSalaryAdvanceAudit1822000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "salary_advances" ADD COLUMN IF NOT EXISTS "updated_at" timestamp NOT NULL DEFAULT now()`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "salary_advance_change_logs" (
        "id" bigserial PRIMARY KEY,
        "salary_advance_id" bigint NOT NULL REFERENCES "salary_advances"("id") ON DELETE CASCADE,
        "action" varchar(32) NOT NULL,
        "changes" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "changed_by_id" bigint REFERENCES "users"("id") ON DELETE SET NULL,
        "changed_by_name" varchar(255),
        "created_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_salary_advance_change_logs_advance_created"
      ON "salary_advance_change_logs" ("salary_advance_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      INSERT INTO "salary_advance_change_logs"
        ("salary_advance_id", "action", "changes", "changed_by_id", "changed_by_name", "created_at")
      SELECT
        advance."id",
        'CREATED',
        jsonb_build_object(
          'staff_member', jsonb_build_object('old_value', NULL, 'new_value', CONCAT(staff."employee_code", ' · ', staff."full_name")),
          'advance_date', jsonb_build_object('old_value', NULL, 'new_value', advance."advance_date"),
          'amount', jsonb_build_object('old_value', NULL, 'new_value', advance."amount"),
          'fund', jsonb_build_object('old_value', NULL, 'new_value', CONCAT_WS(' · ', fund."code", fund."name")),
          'hub', jsonb_build_object('old_value', NULL, 'new_value', COALESCE(hub."code", '—')),
          'note', jsonb_build_object('old_value', NULL, 'new_value', advance."note")
        ),
        advance."created_by",
        COALESCE(NULLIF(BTRIM("user"."full_name"), ''), NULLIF(BTRIM("user"."username"), ''), 'Hệ thống'),
        advance."created_at"
      FROM "salary_advances" advance
      JOIN "staff_members" staff ON staff."id" = advance."staff_member_id"
      JOIN "cash_funds" fund ON fund."id" = advance."fund_id"
      LEFT JOIN "hubs" hub ON hub."id" = advance."hub_id"
      LEFT JOIN "users" "user" ON "user"."id" = advance."created_by"
      WHERE NOT EXISTS (
        SELECT 1 FROM "salary_advance_change_logs" log
        WHERE log."salary_advance_id" = advance."id" AND log."action" = 'CREATED'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "salary_advance_change_logs"`);
    await queryRunner.query(`ALTER TABLE "salary_advances" DROP COLUMN IF EXISTS "updated_at"`);
  }
}
