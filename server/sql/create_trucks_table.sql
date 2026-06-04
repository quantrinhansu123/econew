-- Chỉ tạo bảng trucks (+ cột mở rộng). Chạy TRƯỚC link_trucks_vendors_and_trip_cost.sql nếu tách bước.

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
  khu_vuc VARCHAR(128)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UQ_trucks_license_plate') THEN
    ALTER TABLE trucks ADD CONSTRAINT UQ_trucks_license_plate UNIQUE (license_plate);
  END IF;
END $$;

UPDATE trucks SET bks = license_plate WHERE bks IS NULL AND license_plate IS NOT NULL;
