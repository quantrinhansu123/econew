-- Phiếu chi / Thanh toán NCC (Video 5 — Công nợ & Thanh toán)
-- Chạy sau vendors, trips, vendor_debt_entries

CREATE TABLE IF NOT EXISTS vendor_payments (
  id BIGSERIAL PRIMARY KEY,
  vendor_id BIGINT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  payment_date TIMESTAMP NOT NULL,
  description VARCHAR(500),
  created_by BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_payment_trips (
  payment_id BIGINT NOT NULL REFERENCES vendor_payments(id) ON DELETE CASCADE,
  trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  PRIMARY KEY (payment_id, trip_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor_date
  ON vendor_payments (vendor_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_vendor_payment_trips_trip
  ON vendor_payment_trips (trip_id);
