-- 005 (final pass, 2026-10-26)
-- orders.checkout_id  the id the checkout page sends with every attempt of one draft (32 hex).
--                     A repeated POST /api/checkout with the same id and e-mail within 24 h is
--                     answered with the order already made (a 201 lost on a weak connection must
--                     not create a second order and hold the rooms, seats or stock twice).
ALTER TABLE orders ADD COLUMN checkout_id TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_checkout ON orders(checkout_id, email_key) WHERE checkout_id IS NOT NULL;
