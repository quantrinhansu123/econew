-- Chạy file này TRƯỚC nếu bạn chỉ cần tạo bảng vendors
-- (tương đương migration 1716680000005-AddVendorsConfiguration)

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
CREATE INDEX IF NOT EXISTS idx_vendors_province ON vendors(province);
CREATE INDEX IF NOT EXISTS idx_vendors_contract_type ON vendors(contract_type);
