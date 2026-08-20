import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStaffDirectoryAttendancePayroll1816000000000 implements MigrationInterface {
  name = 'AddStaffDirectoryAttendancePayroll1816000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "staff_departments" (
        "id" BIGSERIAL PRIMARY KEY,
        "code" varchar(32) NOT NULL,
        "name" varchar(120) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_staff_departments_code" ON "staff_departments" (UPPER("code"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_staff_departments_name" ON "staff_departments" (LOWER("name"))`);
    await queryRunner.query(`
      INSERT INTO "staff_departments" ("code", "name") VALUES
        ('LAI_XE', 'Lái xe'), ('KE_TOAN', 'Kế toán'), ('BOC_XEP', 'Bốc xếp'),
        ('KHO', 'Kho'), ('DIEU_PHOI', 'Điều phối'), ('VAN_PHONG', 'Văn phòng')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "staff_departments" ("code", "name")
      SELECT 'BP_' || id::text, name
      FROM (
        SELECT MIN(id) AS id, MIN(TRIM(department)) AS name
        FROM staff_members
        WHERE NULLIF(TRIM(department), '') IS NOT NULL
        GROUP BY LOWER(TRIM(department))
      ) legacy
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`ALTER TABLE "staff_members" ALTER COLUMN "password_hash" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "employee_code" varchar(32)`);
    await queryRunner.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "department_id" bigint`);
    await queryRunner.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "email" varchar(255)`);
    await queryRunner.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "identity_number" varchar(32)`);
    await queryRunner.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "address" varchar(500)`);
    await queryRunner.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "hire_date" date`);
    await queryRunner.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "employment_status" varchar(16) NOT NULL DEFAULT 'ACTIVE'`);
    await queryRunner.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "hub_id" bigint`);
    await queryRunner.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "user_id" bigint`);
    await queryRunner.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "base_salary" numeric(14,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "meal_allowance" numeric(14,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "transport_allowance" numeric(14,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "other_allowance" numeric(14,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "overtime_hourly_rate" numeric(14,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "standard_work_days" numeric(5,2) NOT NULL DEFAULT 26`);
    await queryRunner.query(`ALTER TABLE "staff_members" ADD COLUMN IF NOT EXISTS "note" varchar(1000)`);
    await queryRunner.query(`UPDATE "staff_members" SET "employee_code" = 'NV' || LPAD(id::text, 5, '0') WHERE NULLIF(TRIM("employee_code"), '') IS NULL`);
    await queryRunner.query(`
      UPDATE "staff_members" staff
      SET "department_id" = department.id
      FROM "staff_departments" department
      WHERE staff."department_id" IS NULL AND LOWER(TRIM(staff."department")) = LOWER(department."name")
    `);
    await queryRunner.query(`ALTER TABLE "staff_members" ALTER COLUMN "employee_code" SET NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_staff_members_employee_code" ON "staff_members" (UPPER("employee_code"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_staff_members_user_id" ON "staff_members" ("user_id") WHERE "user_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_staff_members_department" ON "staff_members" ("department_id")`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "staff_attendance_records" (
        "id" BIGSERIAL PRIMARY KEY,
        "staff_member_id" bigint NOT NULL,
        "work_date" date NOT NULL,
        "work_days" numeric(4,2) NOT NULL DEFAULT 0,
        "overtime_hours" numeric(6,2) NOT NULL DEFAULT 0,
        "note" varchar(500),
        "created_by" bigint,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_staff_attendance_day" ON "staff_attendance_records" ("staff_member_id", "work_date")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_staff_attendance_month" ON "staff_attendance_records" ("work_date", "staff_member_id")`);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_staff_members_department') THEN
          ALTER TABLE "staff_members" ADD CONSTRAINT "FK_staff_members_department" FOREIGN KEY ("department_id") REFERENCES "staff_departments"("id") ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_staff_members_hub') THEN
          ALTER TABLE "staff_members" ADD CONSTRAINT "FK_staff_members_hub" FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_staff_members_user') THEN
          ALTER TABLE "staff_members" ADD CONSTRAINT "FK_staff_members_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_staff_attendance_member') THEN
          ALTER TABLE "staff_attendance_records" ADD CONSTRAINT "FK_staff_attendance_member" FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_staff_attendance_creator') THEN
          ALTER TABLE "staff_attendance_records" ADD CONSTRAINT "FK_staff_attendance_creator" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_attendance_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_departments" CASCADE`);
  }
}
