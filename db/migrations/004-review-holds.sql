-- 004 (T1 fix round 3, 2026-10-23)
-- orders.review  why an unconfirmed order got the SHORT hold (settings.inventory.short_hold_hours)
--                instead of 24/72 h: comma list of far_or_long, surge, address_share,
--                person_open_orders. Shown to staff; confirming the order ends the hold.
ALTER TABLE orders ADD COLUMN review TEXT;
-- Seat share cap and surge counts read order_items by session.
CREATE INDEX IF NOT EXISTS idx_order_items_session ON order_items(session_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id, kind);
-- TEST-paid orders from before this migration keep inventory forever (hold_until was cleared on
-- payment). They now count as unconfirmed and are released by the sweep: give them a 24 h hold.
UPDATE orders SET hold_until = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+24 hours')
 WHERE test = 1 AND status != 'cancelled' AND staff_hold = 0 AND demo = 0 AND hold_until IS NULL;
