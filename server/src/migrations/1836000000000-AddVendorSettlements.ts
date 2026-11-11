import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVendorSettlements1836000000000 implements MigrationInterface {
  name = 'AddVendorSettlements1836000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "vendor_settlements" (
        "id" bigserial PRIMARY KEY,
        "vendor_id" bigint NOT NULL REFERENCES "vendors"("id") ON DELETE RESTRICT,
        "from_date" date NOT NULL,
        "to_date" date NOT NULL,
        "created_by" bigint NOT NULL REFERENCES "users"("id"),
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_vendor_settlement_dates" CHECK ("from_date" <= "to_date")
      );
      CREATE INDEX "IDX_vendor_settlement_vendor" ON "vendor_settlements" ("vendor_id", "from_date" DESC);
      CREATE TABLE "vendor_settlement_items" (
        "settlement_id" bigint NOT NULL REFERENCES "vendor_settlements"("id") ON DELETE CASCADE,
        "trip_id" bigint NOT NULL,
        "amount" numeric(18,2) NOT NULL CHECK ("amount" > 0),
        PRIMARY KEY ("settlement_id", "trip_id"),
        CONSTRAINT "UQ_vendor_settlement_trip" UNIQUE ("trip_id"),
        CONSTRAINT "FK_vendor_settlement_trip" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT
      );
      ALTER TABLE "vendor_payment_allocations" ADD COLUMN "settlement_id" bigint NULL
        REFERENCES "vendor_settlements"("id") ON DELETE RESTRICT;
      CREATE INDEX "IDX_vendor_allocation_settlement" ON "vendor_payment_allocations" ("settlement_id");
    `);
    // Keep the financial snapshot stable; operational arrival/delivery updates remain allowed.
    await queryRunner.query(`
      CREATE FUNCTION "guard_vendor_settlement_trip"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM vendor_settlement_items WHERE trip_id = OLD.id) AND (
          COALESCE(NEW.trip_cost, NEW.other_costs, 0) IS DISTINCT FROM COALESCE(OLD.trip_cost, OLD.other_costs, 0)
          OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
          OR NEW.departure_time IS DISTINCT FROM OLD.departure_time
          OR (NEW.status::text = 'CANCELLED' AND OLD.status::text <> 'CANCELLED')
        ) THEN
          RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'vendor_settlement_trip_locked',
            MESSAGE = 'Chuyến đã chốt công nợ kỳ: không được đổi cước, NCC, ngày khởi hành hoặc hủy chuyến.';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER "TR_vendor_settlement_trip" BEFORE UPDATE ON "trips"
        FOR EACH ROW EXECUTE FUNCTION "guard_vendor_settlement_trip"();
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TR_vendor_settlement_trip" ON "trips";
      DROP FUNCTION IF EXISTS "guard_vendor_settlement_trip"();
      DROP INDEX IF EXISTS "IDX_vendor_allocation_settlement";
      ALTER TABLE "vendor_payment_allocations" DROP COLUMN "settlement_id";
      DROP TABLE "vendor_settlement_items";
      DROP TABLE "vendor_settlements";`);
  }
}
