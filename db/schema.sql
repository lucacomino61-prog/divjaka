-- Divjaka Smart Tourism Platform — SQLite schema (PLAN.md §5).
-- Money in whole lek (ALL). Dates 'YYYY-MM-DD'. Times are Europe/Tirane wall-clock,
-- written 'YYYY-MM-DDTHH:MM' (sessions.starts_at) or full ISO UTC with Z (created_at etc.).
-- Every statement is idempotent: this file is applied on every boot (src/lib/db/index.ts)
-- and by scripts/seed.mjs. Later changes go in db/migrations/NNN-name.sql.

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL                                   -- JSON
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL COLLATE NOCASE,
  name TEXT,
  password_hash TEXT NOT NULL,                          -- scrypt$N$r$p$salt$hash (base64url)
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','staff')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,                          -- sha256 hex of the cookie token
  user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,                                  -- stays, experiences, bundles, gifts, local
  name_sq TEXT NOT NULL,
  name_en TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('room','experience','bundle','gift','goods')),
  category TEXT REFERENCES categories(id) ON UPDATE CASCADE ON DELETE SET NULL,
  name_sq TEXT NOT NULL,
  name_en TEXT NOT NULL,
  summary_sq TEXT, summary_en TEXT,
  body_sq TEXT, body_en TEXT,                           -- short markdown subset
  includes_sq TEXT NOT NULL DEFAULT '[]',               -- JSON array of strings
  includes_en TEXT NOT NULL DEFAULT '[]',
  price INTEGER NOT NULL CHECK (price >= 0),            -- room: per night; experience: per person; others: per unit
  compare_at INTEGER CHECK (compare_at IS NULL OR compare_at >= 0),
  stock INTEGER CHECK (stock IS NULL OR stock >= 0),    -- goods/bundle/gift; NULL = not tracked
  units INTEGER CHECK (units IS NULL OR units >= 0),    -- room: identical rooms of this type
  capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0), -- room: max guests per room; experience: default seats per session
  duration_min INTEGER,
  poi TEXT,                                             -- research/geo.json poi id (chart pin)
  tags TEXT NOT NULL DEFAULT '[]',
  seasons TEXT NOT NULL DEFAULT '[]',                   -- months 1-12
  images TEXT NOT NULL DEFAULT '[]',                    -- [{slug, alt_sq, alt_en}] photos.json slug or {src:'/media/yyyy/id', ...}
  options TEXT NOT NULL DEFAULT '{}',                   -- added by T1: kind-specific JSON (room {min_nights, beds_sq, beds_en, size_m2}, gift {amount_min, amount_max, amount_step}, experience {meeting_poi, languages}, any {google_category})
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  featured INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  demo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bundle_items (
  bundle_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  PRIMARY KEY (bundle_id, product_id)
);

CREATE TABLE IF NOT EXISTS room_rates (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  date_from TEXT NOT NULL,                              -- inclusive
  date_to TEXT NOT NULL,                                -- inclusive
  price INTEGER NOT NULL CHECK (price >= 0),
  note TEXT,
  CHECK (date_to >= date_from)
);

CREATE TABLE IF NOT EXISTS room_nights (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  night TEXT NOT NULL,
  booked INTEGER NOT NULL DEFAULT 0 CHECK (booked >= 0),
  closed INTEGER NOT NULL DEFAULT 0 CHECK (closed >= 0),
  PRIMARY KEY (product_id, night)
);

-- booked + closed may never exceed the room type's units: the transaction aborts.
CREATE TRIGGER IF NOT EXISTS room_nights_cap_ins BEFORE INSERT ON room_nights
WHEN NEW.booked + NEW.closed > COALESCE((SELECT units FROM products WHERE id = NEW.product_id), 0)
BEGIN SELECT RAISE(ABORT, 'room_nights_over_capacity'); END;

CREATE TRIGGER IF NOT EXISTS room_nights_cap_upd BEFORE UPDATE OF booked, closed ON room_nights
WHEN NEW.booked + NEW.closed > COALESCE((SELECT units FROM products WHERE id = NEW.product_id), 0)
 AND (NEW.booked > OLD.booked OR NEW.closed > OLD.closed)
BEGIN SELECT RAISE(ABORT, 'room_nights_over_capacity'); END;

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,                              -- 'YYYY-MM-DDTHH:MM' Europe/Tirane
  capacity INTEGER NOT NULL CHECK (capacity >= 0),
  booked INTEGER NOT NULL DEFAULT 0 CHECK (booked >= 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','cancelled')),
  note TEXT,
  CHECK (booked <= capacity),
  UNIQUE (product_id, starts_at)
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL COLLATE NOCASE,
  name TEXT, phone TEXT, country TEXT, lang TEXT,
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  consent_at TEXT,
  created_at TEXT NOT NULL,
  notes TEXT,
  demo INTEGER NOT NULL DEFAULT 0                       -- added by T1: rows created by `seed --demo`
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  email TEXT NOT NULL, name TEXT NOT NULL, phone TEXT, country TEXT,
  lang TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','confirmed','completed','cancelled')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('hotel','bank','card')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded','failed')),
  payment_provider TEXT,                                -- added by T1: 'test' | 'pok' for card
  payment_ref TEXT,
  subtotal INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL,
  promo_code TEXT,
  notes TEXT,
  source TEXT,                                          -- utm_source or referrer domain
  sid TEXT,                                             -- added by T1: analytics tab id (funnel join)
  demo INTEGER NOT NULL DEFAULT 0,                      -- added by T1
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  paid_at TEXT, cancelled_at TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  line_total INTEGER NOT NULL,                          -- after automatic offers, before promo
  date_from TEXT, date_to TEXT,
  session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  guests INTEGER,
  meta TEXT                                             -- JSON {nights, offer, promo_share, starts_at, slug, amount}
);

CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY,
  name_sq TEXT, name_en TEXT,
  type TEXT NOT NULL CHECK (type IN ('percent','fixed')),
  value INTEGER NOT NULL CHECK (value >= 0),
  scope TEXT NOT NULL DEFAULT '{}',                     -- {kinds:[], categories:[], products:[slug|id]} empty = everything
  min_nights INTEGER, min_total INTEGER,
  starts_on TEXT, ends_on TEXT,                         -- inclusive window
  code TEXT UNIQUE COLLATE NOCASE,                      -- NULL = automatic offer; else promo code
  max_uses INTEGER, used INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  demo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS inventory_log (
  id INTEGER PRIMARY KEY,
  product_id INTEGER, session_id INTEGER, night TEXT,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,                                 -- order, cancel, sweep, admin_close, admin_open, admin_stock, admin_capacity
  order_id INTEGER, admin_id INTEGER,
  ts TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('contact','assistant','callback')),
  name TEXT, email TEXT, phone TEXT, lang TEXT, subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','done')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS faq (
  id INTEGER PRIMARY KEY,
  q_sq TEXT, q_en TEXT, a_sq TEXT, a_en TEXT,
  keywords TEXT,                                        -- comma separated, either language
  links TEXT,                                           -- JSON [{key, label_sq, label_en, params?}] route keys or absolute paths
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL, day TEXT NOT NULL, type TEXT NOT NULL,
  path TEXT, lang TEXT, product_id INTEGER, value INTEGER, sid TEXT, ref TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
  device TEXT, meta TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_day_type ON events(day, type);
CREATE INDEX IF NOT EXISTS idx_events_type_product ON events(type, product_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_session ON order_items(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_product_start ON sessions(product_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(starts_at);
CREATE INDEX IF NOT EXISTS idx_room_nights_night ON room_nights(night);
CREATE INDEX IF NOT EXISTS idx_room_rates_product ON room_rates(product_id, date_from);
CREATE INDEX IF NOT EXISTS idx_products_kind_status ON products(kind, status);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_log_product ON inventory_log(product_id, ts);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status, created_at);

INSERT OR IGNORE INTO schema_version (version, name, applied_at) VALUES (1, 'schema', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
