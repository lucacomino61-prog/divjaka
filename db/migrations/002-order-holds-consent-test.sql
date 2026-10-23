-- 002 (T1 fix round 1, 2026-10-23)
-- orders.test               1 = paid through the TEST card simulator: never counted as money
-- orders.marketing_consent  the box ticked at THIS checkout (unverified); it reaches
--                           customers.marketing_consent only when the order is paid or staff confirm it
-- orders.hold_until         UTC ISO instant after which an unpaid, unconfirmed order is released by the sweep
ALTER TABLE orders ADD COLUMN test INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN marketing_consent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN hold_until TEXT;
UPDATE orders SET test = 1 WHERE payment_provider = 'test';
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email COLLATE NOCASE, status);
CREATE INDEX IF NOT EXISTS idx_orders_hold ON orders(status, hold_until);
