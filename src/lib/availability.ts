/**
 * Availability: room nights left, session seats left, goods stock, month calendars.
 * Reads only; holds are written by orders.ts inside its transaction.
 */
import { all, get } from './db/index';
import type { Product } from './db/repo/products';
import { listProducts } from './db/repo/products';
import { nightsBetween, ratesBetween, type RoomRate } from './db/repo/rooms';
import { listSessions, type Session } from './db/repo/sessions';
import { getSetting } from './db/repo/settings';
import { addDays, monthDays, nights as nightList, tirane, hhmm, minutesOf } from './time';

export interface NightInfo { night: string; price: number; left: number; closed: boolean; booked: number; closed_units: number }

/** Per-night price: the newest room_rates row covering the night, else the base price. */
export function nightPrice(p: Pick<Product, 'price'>, night: string, rates: RoomRate[]): number {
  let best: RoomRate | undefined;
  for (const r of rates) if (r.date_from <= night && r.date_to >= night && (!best || r.id > best.id)) best = r;
  return best ? best.price : p.price;
}

/** Nights [from, to) with price and rooms left. */
export function roomNights(p: Product, from: string, to: string): NightInfo[] {
  const list = nightList(from, to);
  if (!list.length) return [];
  const rates = ratesBetween(p.id, from, addDays(to, -1));
  const rows = new Map(nightsBetween(p.id, from, to).map((r) => [r.night, r]));
  const units = p.units ?? 0;
  return list.map((night) => {
    const r = rows.get(night);
    const booked = r?.booked ?? 0;
    const closedUnits = r?.closed ?? 0;
    const left = Math.max(0, units - booked - closedUnits);
    return { night, price: nightPrice(p, night, rates), left, booked, closed: closedUnits >= units && units > 0, closed_units: closedUnits };
  });
}

/** Rooms of this type free on every night of [from, to). */
export function roomRangeLeft(p: Product, from: string, to: string): number {
  const n = roomNights(p, from, to);
  return n.length ? n.reduce((m, x) => (x.left < m ? x.left : m), Infinity) : 0;
}

/**
 * True when the room unit counts are real: at least one published room type and every one of
 * them saved by the owner (demo = 0). Until then the seeded 8/4/4 units are demo values (PLAN §2),
 * so no public surface states how many rooms are free (ticker, assistant).
 */
export function roomsVerified(): boolean {
  const rooms = listProducts({ kind: 'room' });
  return rooms.length > 0 && rooms.every((p) => !p.demo);
}

export type DayStatus = 'past' | 'open' | 'full' | 'closed';
export interface CalendarDay { date: string; price: number; left: number; status: DayStatus }

export function roomMonth(p: Product, ym: string): CalendarDay[] {
  const days = monthDays(ym);
  const today = tirane().date;
  const infos = roomNights(p, days[0], addDays(days[days.length - 1], 1));
  return infos.map((n) => ({
    date: n.night,
    price: n.price,
    left: n.night < today ? 0 : n.left,
    status: n.night < today ? 'past' : n.closed ? 'closed' : n.left <= 0 ? 'full' : 'open',
  }));
}

/** The earliest local date-time a session may still be booked from. */
export function bookingCutoff(): string {
  const hours = getSetting('inventory').booking_cutoff_hours ?? 2;
  const t = tirane(new Date(Date.now() + hours * 3600_000));
  return t.dateTime;
}

export const seatsLeft = (s: Pick<Session, 'capacity' | 'booked'>) => Math.max(0, s.capacity - s.booked);

export function sessionBookable(s: Session): boolean {
  return s.status === 'open' && s.starts_at >= bookingCutoff() && seatsLeft(s) > 0;
}

export interface SessionInfo { id: number; starts_at: string; date: string; time: string; capacity: number; left: number; status: 'open' | 'full' | 'closed' | 'past' }

export function sessionInfo(s: Session, cutoff = bookingCutoff()): SessionInfo {
  const left = seatsLeft(s);
  const status = s.starts_at < cutoff ? 'past' : s.status !== 'open' ? 'closed' : left <= 0 ? 'full' : 'open';
  return { id: s.id, starts_at: s.starts_at, date: s.starts_at.slice(0, 10), time: s.starts_at.slice(11, 16), capacity: s.capacity, left: status === 'open' ? left : 0, status };
}

/** Sessions of a month (cancelled ones hidden). */
export function sessionsMonth(p: Product, ym: string): SessionInfo[] {
  const days = monthDays(ym);
  const cutoff = bookingCutoff();
  return listSessions({ product_id: p.id, from: `${days[0]}T00:00`, to: `${addDays(days[days.length - 1], 1)}T00:00` })
    .filter((s) => s.status !== 'cancelled')
    .map((s) => sessionInfo(s, cutoff));
}

/** Next bookable sessions of an experience. */
export function nextSessions(productId: number, limit = 5): SessionInfo[] {
  const cutoff = bookingCutoff();
  return all<Session>(
    "SELECT * FROM sessions WHERE product_id = ? AND status = 'open' AND starts_at >= ? AND booked < capacity ORDER BY starts_at LIMIT ?",
    productId, cutoff, limit,
  ).map((s) => sessionInfo(s, cutoff));
}

/** Sum of rooms free tonight across published room types (null when there are none). */
export function roomsLeftTonight(): number | null {
  const rooms = listProducts({ kind: 'room' });
  if (!rooms.length) return null;
  const today = tirane().date;
  return rooms.reduce((sum, p) => sum + roomRangeLeft(p, today, addDays(today, 1)), 0);
}

/** Today's remaining sessions with seats (published experiences only). */
export function sessionsToday(): { slug: string; name_sq: string; name_en: string; starts_at: string; left: number }[] {
  const t = tirane();
  const cutoff = bookingCutoff();
  const from = cutoff > `${t.date}T00:00` ? cutoff : `${t.date}T00:00`;
  return all<{ slug: string; name_sq: string; name_en: string; starts_at: string; capacity: number; booked: number }>(
    `SELECT p.slug, p.name_sq, p.name_en, s.starts_at, s.capacity, s.booked FROM sessions s JOIN products p ON p.id = s.product_id
     WHERE p.status = 'published' AND s.status = 'open' AND s.starts_at >= ? AND s.starts_at < ? AND s.booked < s.capacity
     ORDER BY s.starts_at`,
    from, `${addDays(t.date, 1)}T00:00`,
  ).map((r) => ({ slug: r.slug, name_sq: r.name_sq, name_en: r.name_en, starts_at: r.starts_at, left: r.capacity - r.booked }));
}

/** Occupancy per day for the next `days` days across published rooms. */
export function occupancy(from: string, days: number): { date: string; units: number; booked: number; closed: number; rate: number }[] {
  const rooms = listProducts({ kind: 'room' });
  const total = rooms.reduce((s, p) => s + (p.units ?? 0), 0);
  const to = addDays(from, days);
  const rows = all<{ night: string; booked: number; closed: number }>(
    `SELECT night, SUM(booked) AS booked, SUM(closed) AS closed FROM room_nights rn JOIN products p ON p.id = rn.product_id
     WHERE p.kind = 'room' AND p.status = 'published' AND night >= ? AND night < ? GROUP BY night`,
    from, to,
  );
  const map = new Map(rows.map((r) => [r.night, r]));
  return nightList(from, to).map((date) => {
    const r = map.get(date);
    const booked = Number(r?.booked ?? 0);
    const closed = Number(r?.closed ?? 0);
    const open = Math.max(0, total - closed);
    return { date, units: total, booked, closed, rate: open ? Math.round((booked / open) * 1000) / 10 : 0 };
  });
}

/** Goods/bundles/gifts: null = not tracked (always available). */
export function stockLeft(p: Pick<Product, 'stock'>): number | null {
  return p.stock;
}

/** Availability summary for product cards (catalog). */
export function availabilitySummary(p: Product): { left: number | null; next: string | null } {
  if (p.kind === 'room') {
    const today = tirane().date;
    return { left: roomRangeLeft(p, today, addDays(today, 1)), next: null };
  }
  if (p.kind === 'experience') {
    const n = nextSessions(p.id, 1)[0];
    return { left: n ? n.left : 0, next: n ? n.starts_at : null };
  }
  return { left: p.stock, next: null };
}

/** Helper for weekly session generation: local date-times for weekdays × times in [from, to]. */
export function weeklySlots(weekdays: number[], times: string[], from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = new Date(d + 'T00:00:00Z').getUTCDay();
    if (!weekdays.includes(wd)) continue;
    for (const t of times) out.push(`${d}T${hhmm(minutesOf(t))}`);
  }
  return out;
}

export const sessionById = (id: number) => get<Session>('SELECT * FROM sessions WHERE id = ?', id);
