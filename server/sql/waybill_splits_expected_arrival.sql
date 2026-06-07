-- Ngày tới dự kiến khi xếp hàng lên xe (ngày lên đơn + 3 ngày)
ALTER TABLE waybill_splits ADD COLUMN IF NOT EXISTS expected_arrival_at TIMESTAMP;
