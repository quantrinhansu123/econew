-- Sổ cái công nợ NCC — chạy trực tiếp trên Supabase SQL Editor
-- Bước 1: Sửa 3 giá trị trong CTE params bên dưới
-- Bước 2: Chạy TOÀN BỘ script (Ctrl+A → Run)

WITH params AS (
  SELECT
    1::bigint AS vendor_id,                    -- ← ID nhà cung cấp (vendors.id)
    '2025-05-01'::timestamp AS from_date,      -- ← NULL = không lọc từ ngày
    '2025-05-31 23:59:59'::timestamp AS to_date -- ← NULL = không lọc đến ngày
),
trip_debits AS (
  SELECT
    t.id AS ref_id,
    'TRIP'::text AS entry_type,
    t.departure_time AS entry_date,
    COALESCE(t.trip_cost, t.other_costs, 0)::numeric AS amount,
    COALESCE(t.trip_cost, t.other_costs, 0)::numeric AS signed_amount,
    CONCAT('Chuyến #', t.id) AS description,
    COALESCE(tr.bks, tr.license_plate) AS license_plate
  FROM trips t
  INNER JOIN trucks tr ON tr.id = t.truck_id
  CROSS JOIN params p
  WHERE tr.vendor_id = p.vendor_id
    AND COALESCE(t.trip_cost, t.other_costs, 0) > 0
),
payment_credits AS (
  SELECT
    vp.id AS ref_id,
    'PAYMENT'::text AS entry_type,
    vp.payment_date AS entry_date,
    vp.amount AS amount,
    (-vp.amount)::numeric AS signed_amount,
    vp.description,
    NULL::varchar AS license_plate
  FROM vendor_payments vp
  CROSS JOIN params p
  WHERE vp.vendor_id = p.vendor_id
),
ledger AS (
  SELECT * FROM trip_debits
  UNION ALL
  SELECT * FROM payment_credits
),
ordered AS (
  SELECT
    l.*,
    SUM(l.signed_amount) OVER (ORDER BY l.entry_date, l.entry_type ROWS UNBOUNDED PRECEDING) AS running_balance
  FROM ledger l
)
SELECT
  o.entry_date,
  o.entry_type,
  o.ref_id,
  o.description,
  o.license_plate,
  o.amount,
  o.signed_amount,
  o.running_balance
FROM ordered o
CROSS JOIN params p
WHERE (p.from_date IS NULL OR o.entry_date >= p.from_date)
  AND (p.to_date IS NULL OR o.entry_date <= p.to_date)
ORDER BY o.entry_date, o.entry_type;

-- ─── Tổng hợp dư nợ (chạy riêng nếu cần) ───
-- Sửa vendor_id rồi chạy block dưới:

/*
WITH p AS (SELECT 1::bigint AS vendor_id)
SELECT
  v.id,
  v.name,
  COALESCE(SUM(COALESCE(t.trip_cost, t.other_costs, 0)), 0) AS total_incurred,
  COALESCE((
    SELECT SUM(vp.amount) FROM vendor_payments vp WHERE vp.vendor_id = v.id
  ), 0) AS total_paid,
  COALESCE(SUM(COALESCE(t.trip_cost, t.other_costs, 0)), 0)
    - COALESCE((
        SELECT SUM(vp.amount) FROM vendor_payments vp WHERE vp.vendor_id = v.id
      ), 0) AS remaining_debt
FROM vendors v
CROSS JOIN p
LEFT JOIN trucks tr ON tr.vendor_id = v.id
LEFT JOIN trips t ON t.truck_id = tr.id
  AND COALESCE(t.trip_cost, t.other_costs, 0) > 0
WHERE v.id = p.vendor_id
GROUP BY v.id, v.name;
*/
