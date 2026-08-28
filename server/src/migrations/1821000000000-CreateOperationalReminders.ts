import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOperationalReminders1821000000000 implements MigrationInterface {
  name = 'CreateOperationalReminders1821000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "operational_reminders" (
        "id" bigserial PRIMARY KEY,
        "title" varchar(160) NOT NULL,
        "note" text,
        "remind_date" date NOT NULL,
        "category" varchar(40) NOT NULL DEFAULT 'VEHICLE_DOCUMENT',
        "status" varchar(16) NOT NULL DEFAULT 'ACTIVE',
        "truck_id" bigint,
        "hub_id" bigint,
        "created_by_id" bigint NOT NULL,
        "completed_by_id" bigint,
        "completed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_operational_reminders_status" CHECK ("status" IN ('ACTIVE', 'COMPLETED')),
        CONSTRAINT "FK_operational_reminders_truck" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_operational_reminders_hub" FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_operational_reminders_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_operational_reminders_completed_by" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_operational_reminders_active_date" ON "operational_reminders" ("status", "remind_date")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_operational_reminders_truck" ON "operational_reminders" ("truck_id") WHERE "truck_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_operational_reminders_hub" ON "operational_reminders" ("hub_id") WHERE "hub_id" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "operational_reminders"`);
  }
}
