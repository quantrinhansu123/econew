-- Thêm cột cho bảng trucks (PostgreSQL / Supabase)
-- Mapping: Tên lái xe → ten_lai_xe | Nhà xe → nha_xe | BKS → bks | Loại xe → loai_xe | Khu vực → khu_vuc

ALTER TABLE trucks ADD COLUMN IF NOT EXISTS ten_lai_xe VARCHAR(255);
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS nha_xe VARCHAR(255);
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS bks VARCHAR(32);
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS loai_xe VARCHAR(128);
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS khu_vuc VARCHAR(128);

COMMENT ON COLUMN trucks.ten_lai_xe IS 'Tên lái xe';
COMMENT ON COLUMN trucks.nha_xe IS 'Nhà xe';
COMMENT ON COLUMN trucks.bks IS 'BKS (biển kiểm soát)';
COMMENT ON COLUMN trucks.loai_xe IS 'Loại xe: Nội bộ | Đường trục | Đối tác';
COMMENT ON COLUMN trucks.khu_vuc IS 'Khu vực';

-- Gợi ý: đồng bộ BKS từ cột license_plate hiện có (nếu có dữ liệu cũ)
UPDATE trucks
SET bks = license_plate
WHERE bks IS NULL AND license_plate IS NOT NULL;
