-- Luồng phối hợp Kho bốc (xuất) ↔ Kho nhận (HCM)
-- Chạy sau schema gốc (waybills, manifests, trips, trucks)

-- Waybills: SĐT & ngày bốc
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS receiver_phone VARCHAR(32);
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS sender_phone VARCHAR(32);
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS loaded_at TIMESTAMP;

-- Vị trí xếp hàng trên bảng kê (1 = sâu trong xe, dỡ cuối)
ALTER TABLE manifest_waybills ADD COLUMN IF NOT EXISTS loading_position INT;
ALTER TABLE manifest_waybills ADD COLUMN IF NOT EXISTS loaded_at TIMESTAMP;

-- Chuyến xe: ETA, chốt cân/khối thực tế, lái xe
ALTER TABLE trips ADD COLUMN IF NOT EXISTS expected_arrival_time TIMESTAMP;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS actual_total_weight DOUBLE PRECISION;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS actual_total_volume DOUBLE PRECISION;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS driver_name VARCHAR(255);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS driver_phone VARCHAR(32);

-- Chi phí phát sinh chi tiết
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category VARCHAR(64);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount NUMERIC(18,2) DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS description VARCHAR(500);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS hub_id BIGINT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by BIGINT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_manifest_waybills_loading_position
  ON manifest_waybills (manifest_id, loading_position);

CREATE INDEX IF NOT EXISTS idx_trips_expected_arrival
  ON trips (status, expected_arrival_time);

CREATE INDEX IF NOT EXISTS idx_expenses_trip_id ON expenses (trip_id);
