import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeliveryRoutes1716680000013 implements MigrationInterface {
  name = 'DeliveryRoutes1716680000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "delivery_routes" (
        "id" BIGSERIAL NOT NULL,
        "code" character varying(64) NOT NULL,
        "name" character varying(255) NOT NULL,
        "hub_id" bigint,
        "province" character varying(128),
        "district" character varying(128),
        "description" character varying(500),
        "status" character varying(32) NOT NULL DEFAULT 'ACTIVE',
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_delivery_routes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_delivery_routes_code" UNIQUE ("code"),
        CONSTRAINT "FK_delivery_routes_hub" FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS "idx_delivery_routes_status_sort"
        ON "delivery_routes" ("status", "sort_order", "code");
      CREATE INDEX IF NOT EXISTS "idx_delivery_routes_hub"
        ON "delivery_routes" ("hub_id")
        WHERE "hub_id" IS NOT NULL;
    `);

    await queryRunner.query(`
      INSERT INTO "delivery_routes" ("code", "name", "province", "district", "sort_order")
      VALUES
        ('HCM-Q7-01', 'Quận 7 — khu Nam Sài Gòn', 'TP.HCM', 'Quận 7', 10),
        ('HCM-TD-02', 'Thủ Đức — khu Đông', 'TP.HCM', 'TP. Thủ Đức', 20),
        ('HCM-Q1-03', 'Quận 1 — trung tâm', 'TP.HCM', 'Quận 1', 30),
        ('HCM-BT-04', 'Bình Tân — Tân Bình', 'TP.HCM', 'Bình Tân', 40),
        ('HCM-GV-05', 'Gò Vấp — Phú Nhuận', 'TP.HCM', 'Gò Vấp', 50)
      ON CONFLICT ("code") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "delivery_routes"`);
  }
}
