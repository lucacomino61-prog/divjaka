-- 003 (T1 fix round 2, 2026-10-23)
-- orders.email_key   normalised e-mail (lower case, +tag removed, Gmail dots removed): the per-person cap
--                    on waiting orders counts this, so attacker+1@x / a.t.t.a.c.k.e.r@gmail.com share one cap
-- orders.phone_key   phone digits (last 9), same purpose
-- orders.staff_hold  1 = staff put this order (back) to pending by hand: never released by the sweep and
--                    not counted as an unconfirmed online hold
ALTER TABLE orders ADD COLUMN email_key TEXT;
ALTER TABLE orders ADD COLUMN phone_key TEXT;
ALTER TABLE orders ADD COLUMN staff_hold INTEGER NOT NULL DEFAULT 0;
UPDATE orders SET email_key = lower(trim(email)) WHERE email_key IS NULL;
-- Orders staff re-opened before this migration (they have a 'reinstate' log row) are staff holds.
UPDATE orders SET staff_hold = 1
 WHERE status = 'pending' AND hold_until IS NULL
   AND EXISTS (SELECT 1 FROM inventory_log l WHERE l.order_id = orders.id AND l.reason = 'reinstate');
-- Card orders from before migration 002 had no hold_until: give them the 30-minute hold they were
-- created with, so the sweep no longer needs a "hold_until IS NULL" branch (which also caught
-- orders staff had re-opened).
UPDATE orders SET hold_until = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+30 minutes')
 WHERE hold_until IS NULL AND staff_hold = 0 AND demo = 0 AND status = 'pending'
   AND payment_method = 'card' AND payment_status IN ('unpaid', 'failed');
CREATE INDEX IF NOT EXISTS idx_orders_email_key ON orders(email_key, status);
CREATE INDEX IF NOT EXISTS idx_orders_phone_key ON orders(phone_key, status);
CREATE INDEX IF NOT EXISTS idx_order_items_room ON order_items(product_id, kind, date_from, date_to);

-- Known admin devices: a successful sign-in sets a long-lived dv_device cookie (only sha256 stored).
-- A sign-in attempt carrying it skips the per-account lock and the sitewide password-check ceiling
-- (it stays under the per-address limits), so a distributed guesser cannot lock the owner out.
CREATE TABLE IF NOT EXISTS admin_devices (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_devices_user ON admin_devices(user_id);

-- Audit trail: sign-ins, lockouts, password changes, payment/IBAN settings, price/offer edits,
-- customer exports and erasures. Never holds secrets (no passwords, no tokens, no IBAN values).
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  admin_id INTEGER,
  action TEXT NOT NULL,
  ip TEXT,                                              -- masked: IPv4 /24, IPv6 /48
  detail TEXT                                           -- JSON
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, ts);

-- Daily roll-up of raw events kept after the raw rows expire (settings.privacy.events_days).
CREATE TABLE IF NOT EXISTS events_daily (
  day TEXT NOT NULL,
  type TEXT NOT NULL,
  product_id INTEGER NOT NULL DEFAULT 0,
  n INTEGER NOT NULL,
  sids INTEGER NOT NULL,
  value_sum INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, type, product_id)
);

-- New defaults for databases seeded before this migration (values still at the old seed default only).
UPDATE settings SET value = json_set(value, '$.hotel_hold_hours', 24)
 WHERE key = 'payments' AND json_extract(value, '$.hotel_hold_hours') = 48;
UPDATE settings SET value = json_set(value, '$.unconfirmed_share', 0.5, '$.max_unconfirmed_room_nights_per_hour', 60,
                                     '$.max_room_nights_per_address_day', 60, '$.pending_alert_per_hour', 5)
 WHERE key = 'inventory' AND json_extract(value, '$.unconfirmed_share') IS NULL;
-- Demo promo codes start inactive (a launch without review must not hand out a live discount).
UPDATE offers SET active = 0 WHERE demo = 1 AND code IS NOT NULL;

-- The browsing tab id is no longer stored with orders (privacy: an order must not link a named
-- guest to a page trail). Old values are cleared.
UPDATE orders SET sid = NULL WHERE sid IS NOT NULL;
UPDATE events SET sid = NULL WHERE type IN ('order', 'paid');
