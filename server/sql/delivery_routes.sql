-- Danh mục tuyến giao hàng (last-mile / phân tuyến tại kho đích)
CREATE TABLE IF NOT EXISTS delivery_routes (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  hub_id BIGINT REFERENCES hubs(id) ON DELETE SET NULL,
  province VARCHAR(128),
  district VARCHAR(128),
  description VARCHAR(500),
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT uq_delivery_routes_code UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_delivery_routes_status_sort
  ON delivery_routes (status, sort_order, code);

CREATE INDEX IF NOT EXISTS idx_delivery_routes_hub
  ON delivery_routes (hub_id)
  WHERE hub_id IS NOT NULL;

INSERT INTO delivery_routes (code, name, province, district, sort_order)
VALUES
  ('HCM-Q7-01', 'Quận 7 — khu Nam Sài Gòn', 'TP.HCM', 'Quận 7', 10),
  ('HCM-TD-02', 'Thủ Đức — khu Đông', 'TP.HCM', 'TP. Thủ Đuc', 20),
  ('HCM-Q1-03', 'Quận 1 — trung tâm', 'TP.HCM', 'Quận 1', 30),
  ('HCM-BT-04', 'Bình Tân — Tân Bình', 'TP.HCM', 'Bình Tân', 40),
  ('HCM-GV-05', 'Gò Vấp — Phú Nhuận', 'TP.HCM', 'Gò Vấp', 50)
ON CONFLICT (code) DO NOTHING;
