-- =============================================================================
-- SUPABASE: Chạy TOÀN BỘ file này một lần (SQL Editor → Run)
-- Tạo đủ bảng nếu chưa có: trucks, trips, vendors → NCC + công nợ
-- =============================================================================

-- 0) Enum trạng thái chuyến (nếu chưa có)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trips_status_enum') THEN
    CREATE TYPE trips_status_enum AS ENUM ('PLANNED', 'IN_TRANSIT', 'ARRIVED', 'COMPLETED');
  END IF;
END $$;

-- 1) Bảng trucks (xe / BKS)
CREATE TABLE IF NOT EXISTS trucks (
  id BIGSERIAL PRIMARY KEY,
  license_plate VARCHAR NOT NULL,
  payload DOUBLE PRECISION NOT NULL DEFAULT 0,
  driver_id BIGINT,
  fuel_consumption_limit DOUBLE PRECISION NOT NULL DEFAULT 0,
  status VARCHAR NOT NULL DEFAULT 'AVAILABLE',
  ten_lai_xe VARCHAR(255),
  nha_xe VARCHAR(255),
  bks VARCHAR(32),
  loai_xe VARCHAR(128),
  khu_vuc VARCHAR(128),
  vendor_id BIGINT
);

-- Helper: kiểm tra constraint đã tồn tại (PostgreSQL lưu conname dạng lowercase)
-- Dùng: lower(conname) = lower('TênConstraint')

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE lower(conname) = lower('UQ_trucks_license_plate')
  ) THEN
    ALTER TABLE trucks ADD CONSTRAINT UQ_trucks_license_plate UNIQUE (license_plate);
  END IF;
END $$;

-- FK driver → users (chỉ khi đã có bảng users)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE lower(conname) = lower('FK_trucks_driver')) THEN
    ALTER TABLE trucks
      ADD CONSTRAINT FK_trucks_driver
      FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE trucks ADD COLUMN IF NOT EXISTS ten_lai_xe VARCHAR(255);
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS nha_xe VARCHAR(255);
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS bks VARCHAR(32);
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS loai_xe VARCHAR(128);
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS khu_vuc VARCHAR(128);
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS vendor_id BIGINT;

UPDATE trucks SET bks = license_plate WHERE bks IS NULL AND license_plate IS NOT NULL;
UPDATE trucks SET fuel_consumption_limit = 0 WHERE fuel_consumption_limit IS NULL;
UPDATE trucks SET status = 'AVAILABLE' WHERE status IS NULL OR status = '';

-- 2) Bảng trips (chuyến xe — cần cho vendor_debt_entries.trip_id)
CREATE TABLE IF NOT EXISTS trips (
  id BIGSERIAL PRIMARY KEY,
  truck_id BIGINT,
  manifest_id BIGINT,
  start_hub_id BIGINT,
  end_hub_id BIGINT,
  departure_time TIMESTAMP NOT NULL DEFAULT NOW(),
  arrival_time TIMESTAMP,
  status trips_status_enum NOT NULL DEFAULT 'PLANNED',
  fuel_actual DOUBLE PRECISION,
  fuel_cost NUMERIC,
  other_costs NUMERIC,
  trip_cost NUMERIC,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE trips ADD COLUMN IF NOT EXISTS trip_cost NUMERIC(18,2);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'trucks')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE lower(conname) = lower('FK_trips_truck')) THEN
    ALTER TABLE trips
      ADD CONSTRAINT FK_trips_truck
      FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3) Bảng vendors (nhà cung cấp)
CREATE TABLE IF NOT EXISTS vendors (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR UNIQUE,
  name VARCHAR,
  service_type VARCHAR,
  contact_name VARCHAR,
  phone VARCHAR,
  email VARCHAR,
  province VARCHAR,
  contract_type VARCHAR,
  status VARCHAR NOT NULL DEFAULT 'ACTIVE',
  routes JSONB,
  pricing JSONB,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);
CREATE INDEX IF NOT EXISTS idx_vendors_service_type ON vendors(service_type);

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payable_balance NUMERIC(18,2) NOT NULL DEFAULT 0;

-- 4) Liên kết trucks → vendors (bỏ qua nếu FK đã có)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE lower(conname) = lower('FK_trucks_vendor_id')) THEN
    ALTER TABLE trucks
      ADD CONSTRAINT FK_trucks_vendor_id
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5) Lịch sử công nợ NCC
CREATE TABLE IF NOT EXISTS vendor_debt_entries (
  id BIGSERIAL PRIMARY KEY,
  vendor_id BIGINT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  trip_id BIGINT REFERENCES trips(id) ON DELETE SET NULL,
  amount NUMERIC(18,2) NOT NULL,
  description VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 6) NCC mặc định «Công lẻ» + gán xe chưa có NCC
INSERT INTO vendors (code, name, status, payable_balance)
SELECT 'CONG_LE', 'Công lẻ', 'ACTIVE', 0
WHERE NOT EXISTS (SELECT 1 FROM vendors WHERE code = 'CONG_LE' OR name = 'Công lẻ');

UPDATE trucks t
SET vendor_id = v.id
FROM vendors v
WHERE t.vendor_id IS NULL AND (v.code = 'CONG_LE' OR v.name = 'Công lẻ');

-- Xong. Kiểm tra:
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name IN ('trucks','trips','vendors','vendor_debt_entries');
