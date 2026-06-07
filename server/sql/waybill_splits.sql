-- Phân kiện đơn hàng theo xe/chuyến — vẫn 1 waybill gốc để hạch toán ngược
CREATE TABLE IF NOT EXISTS waybill_splits (
  id BIGSERIAL PRIMARY KEY,
  waybill_id BIGINT NOT NULL REFERENCES waybills(id) ON DELETE CASCADE,
  trip_id BIGINT REFERENCES trips(id) ON DELETE SET NULL,
  truck_id BIGINT REFERENCES trucks(id) ON DELETE SET NULL,
  package_count INT NOT NULL CHECK (package_count > 0),
  loading_position INT,
  carrier_label VARCHAR(255),
  note VARCHAR(500),
  load_status VARCHAR(32) NOT NULL DEFAULT 'WAITING_LOAD',
  expected_arrival_at TIMESTAMP,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_waybill_splits_waybill ON waybill_splits (waybill_id);
CREATE INDEX IF NOT EXISTS idx_waybill_splits_trip ON waybill_splits (trip_id);

COMMENT ON TABLE waybill_splits IS 'Chia kiện cùng 1 vận đơn lên nhiều xe/chuyến';
COMMENT ON COLUMN waybill_splits.package_count IS 'Số kiện gán cho xe/chuyến này (tổng các dòng <= waybills.package_count)';
