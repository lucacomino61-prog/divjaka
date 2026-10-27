-- 006 (staff accounts, 2026-10-27)
-- admin_users.disabled_at  set when the owner disables an account (Stafi, /admin/stafi/): it can no
--                          longer sign in, and its sessions and remembered browsers are deleted.
--                          NULL = active. `node scripts/seed.mjs --sync-admin` clears it for the
--                          .env admin (recovery).
ALTER TABLE admin_users ADD COLUMN disabled_at TEXT;
