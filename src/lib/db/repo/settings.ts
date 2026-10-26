/**
 * settings: key → JSON value. Known keys and their defaults live here so every reader
 * gets a complete object even before the owner saves anything.
 */
import { all, get, run, parseJson, toJson } from '../index';

export interface BusinessSettings {
  name: string; legal_name: string; nipt: string; address: string;
  /** Per-language forms of `address` (T0, 2026-10-23); the footer prefers them when confirmed. */
  address_sq?: string; address_en?: string;
  phone: string; email: string;
  whatsapp: string; viber: string; checkin: string; checkout: string; reception_hours: string;
  lat: number | null; lon: number | null; placeholders: string[];
}
export interface PaymentSettings {
  methods: { hotel: boolean; bank: boolean; card: boolean };
  /** 'test': card checkout runs the TEST simulator, and only where test payments are allowed
   *  (dev server, or ALLOW_TEST_PAYMENTS=1). 'live': POK, and only when its keys are set. */
  mode: 'test' | 'live';
  iban: string; bank_name: string; beneficiary: string; swift: string;
  /** Unpaid card orders release their rooms/seats/stock after this many minutes. */
  card_hold_minutes: number;
  /** Unpaid bank-transfer orders that staff have not confirmed are released after N hours (0 = never). */
  bank_hold_hours: number;
  /** Pay-at-hotel orders that staff have not confirmed are released after N hours (0 = never). */
  hotel_hold_hours: number;
}
export interface CurrencySettings { eur_rate: number; eur_rate_date: string; eur_rate_source: string }
export interface InventorySettings {
  low_stock: number; booking_cutoff_hours: number;
  /** Online bookings: furthest arrival date, in days from today. */
  booking_horizon_days: number;
  /** Online bookings: rooms × nights in one order (bigger groups contact the hotel). */
  max_room_nights_per_order: number;
  /** Orders still waiting for payment/confirmation allowed per person (normalised e-mail or phone). */
  max_open_orders_per_email: number;
  /**
   * Share of a room type's units that UNCONFIRMED online orders (pending, not paid, not confirmed
   * by staff) may hold on any night (at least 1 unit). Staff confirmation or payment lifts it.
   */
  unconfirmed_share: number;
  /**
   * "Surge" thresholds: room-nights / seats / units that new unconfirmed pay-at-hotel or bank
   * orders took in the last hour, for the whole site. Past one of them, new orders are still
   * accepted, but anything bigger than a small near-term booking gets the short hold
   * (short_hold_hours) — nobody is refused. The dashboard warns (pending_surge) at half of them.
   */
  max_unconfirmed_room_nights_per_hour: number;
  max_unconfirmed_seats_per_hour: number;
  max_unconfirmed_units_per_hour: number;
  /**
   * One address group's (IPv4 /24, IPv6 /48) share of those hourly amounts; past it that
   * group's further orders get the short hold.
   */
  address_room_nights_per_hour: number;
  address_seats_per_hour: number;
  address_units_per_hour: number;
  /** Per address group and day (refused with 429 above them; all payment methods). */
  max_room_nights_per_address_day: number;
  max_seats_per_address_day: number;
  max_units_per_address_day: number;
  /** Unconfirmed orders: units of one stock-tracked product per order. */
  max_units_per_unconfirmed_order: number;
  /** Per order (all methods): people per experience line, experience lines, people in total. */
  max_people_per_session_line: number;
  max_session_lines_per_order: number;
  max_people_per_order: number;
  /**
   * Hold, in hours, for unconfirmed pay-at-hotel / bank orders that are long (more than
   * far_stay_nights nights), far ahead (arrival more than far_stay_days days away), placed during
   * a surge or past the address share, or by a person who already has open orders from another
   * address. Staff confirmation ends it (orders.review says why it was given).
   */
  short_hold_hours: number;
  far_stay_nights: number;
  far_stay_days: number;
  /** Dashboard warning when this many unconfirmed orders arrive within an hour. */
  pending_alert_per_hour: number;
}
export interface SeoSettings { site_url: string; default_image: string }
export interface AssistantSettings {
  enabled: boolean; handoff_email: string; use_claude: boolean;
  /** Claude calls per day for the whole site; after that the rule engine answers alone. */
  daily_cap: number;
}
export interface PrivacySettings {
  /** Raw analytics events are rolled up into events_daily and deleted after N days. */
  events_days: number;
  /** Handled messages (status 'done') are deleted after N days (0 = keep). */
  messages_days: number;
  /** Raw events accepted per day for the whole site; above it new events are dropped. */
  events_per_day: number;
  /**
   * Raw events accepted per address group (IPv4 /24, IPv6 /48) per day; past it 1 in 20 is
   * kept. search, assistant_q, assistant_miss and vital have their own small budgets and never
   * count against the sitewide ceiling.
   */
  events_per_address_day: number;
  /**
   * Orders that never became real (cancelled — by the sweep or by staff — and never paid) are
   * anonymised after N days (name, e-mail, phone, notes cleared); customers left with no other
   * order are deleted with them. 0 = keep.
   */
  orders_days: number;
  /** inventory_log rows older than N days are deleted (0 = keep). */
  inventory_log_days: number;
}

/**
 * Third-party proof (T0, 2026-10-23): verified aggregate scores the site may show, e.g. the
 * Booking.com guest score (research/business.json hotel.ratings). Never review text, never
 * sub-scores. `show: false` hides every item; the owner edits it in the admin settings.
 */
export interface ProofItem {
  label_sq: string; label_en: string; value: string;
  score?: number; scale?: number; count?: number;
  source_url: string; date: string;
}
export interface ProofSettings { show: boolean; items: ProofItem[] }

/**
 * Booking claims the owner must confirm (T6 2026-10-26): `best_rate_direct` lets the booking pages
 * say "the best price is here" (components/booking/server.ts bestRateConfirmed() reads it).
 */
export interface BookingSettings { best_rate_direct: boolean }

export interface AllSettings {
  business: BusinessSettings;
  payments: PaymentSettings;
  currency: CurrencySettings;
  social: Record<string, string>;
  assistant: AssistantSettings;
  seo: SeoSettings;
  inventory: InventorySettings;
  privacy: PrivacySettings;
  proof: ProofSettings;
  booking: BookingSettings;
}

export const DEFAULTS: AllSettings = {
  business: {
    name: 'Hotel Pelikan', legal_name: '', nipt: '', address: '', phone: '', email: '', whatsapp: '', viber: '',
    checkin: '', checkout: '', reception_hours: '', lat: null, lon: null,
    placeholders: ['legal_name', 'nipt', 'address', 'phone', 'email', 'whatsapp', 'viber', 'checkin', 'checkout', 'reception_hours', 'lat', 'lon'],
  },
  payments: {
    methods: { hotel: true, bank: true, card: true }, mode: 'test',
    iban: '', bank_name: '', beneficiary: '', swift: '', card_hold_minutes: 30, bank_hold_hours: 72, hotel_hold_hours: 24,
  },
  currency: { eur_rate: 100, eur_rate_date: '', eur_rate_source: '' },
  social: {},
  assistant: { enabled: true, handoff_email: '', use_claude: true, daily_cap: 300 },
  seo: { site_url: '', default_image: '' },
  inventory: {
    low_stock: 5, booking_cutoff_hours: 2, booking_horizon_days: 548, max_room_nights_per_order: 40, max_open_orders_per_email: 3,
    unconfirmed_share: 0.5,
    max_unconfirmed_room_nights_per_hour: 60, max_unconfirmed_seats_per_hour: 60, max_unconfirmed_units_per_hour: 20,
    address_room_nights_per_hour: 15, address_seats_per_hour: 20, address_units_per_hour: 5,
    max_room_nights_per_address_day: 60, max_seats_per_address_day: 40, max_units_per_address_day: 20,
    max_units_per_unconfirmed_order: 5,
    max_people_per_session_line: 10, max_session_lines_per_order: 5, max_people_per_order: 30,
    short_hold_hours: 2, far_stay_nights: 7, far_stay_days: 60,
    pending_alert_per_hour: 5,
  },
  privacy: { events_days: 180, messages_days: 730, events_per_day: 30000, events_per_address_day: 2000, orders_days: 90, inventory_log_days: 730 },
  proof: { show: false, items: [] },
  booking: { best_rate_direct: false },
};

export type SettingKey = keyof AllSettings;
export const SETTING_KEYS = Object.keys(DEFAULTS) as SettingKey[];

export function getSetting<K extends SettingKey>(key: K): AllSettings[K] {
  const row = get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  const stored = parseJson<Partial<AllSettings[K]>>(row?.value, {});
  const def = DEFAULTS[key];
  if (def && typeof def === 'object' && !Array.isArray(def)) {
    return { ...(def as object), ...(stored as object) } as AllSettings[K];
  }
  return (stored ?? def) as AllSettings[K];
}

export function getAllSettings(): AllSettings {
  const rows = all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const out = structuredClone(DEFAULTS) as unknown as Record<string, unknown>;
  for (const r of rows) {
    const v = parseJson<unknown>(r.value, null);
    const d = (DEFAULTS as unknown as Record<string, unknown>)[r.key];
    out[r.key] = d && typeof d === 'object' && v && typeof v === 'object' ? { ...(d as object), ...(v as object) } : v;
  }
  return out as unknown as AllSettings;
}

export function setSetting(key: string, value: unknown): void {
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, toJson(value));
}
